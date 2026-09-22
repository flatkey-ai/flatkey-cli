use anyhow::{bail, Context, Result};
use clap::Parser;
use image::{imageops::FilterType, DynamicImage, ImageBuffer, Rgb};
use ndarray::Array4;
use ort::{session::Session, value::Tensor};
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

const MODEL_URL: &str =
    "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";
const MODEL_INPUT: u32 = 364;

#[derive(Debug, Parser)]
#[command(name = "flatkey-depth", version)]
struct Args {
    #[arg(long)]
    source: PathBuf,
    #[arg(long)]
    output: PathBuf,
    #[arg(long, default_value_t = 100)]
    frame_ratio: u8,
    #[arg(long, default_value = "480p")]
    resolution: String,
    #[arg(long)]
    work_dir: PathBuf,
    #[arg(long)]
    model: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
struct ResultJson {
    output: PathBuf,
    frame_ratio: u8,
    resolution: String,
    model: String,
    inference: String,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if !(20..=100).contains(&args.frame_ratio) {
        bail!("--frame-ratio must be between 20 and 100");
    }
    if !matches!(args.resolution.as_str(), "original" | "480p" | "320p") {
        bail!("--resolution must be original, 480p, or 320p");
    }

    std::fs::create_dir_all(&args.work_dir)?;
    let model = args
        .model
        .or_else(|| std::env::var_os("FLATKEY_DEPTH_MODEL").map(PathBuf::from))
        .ok_or_else(|| anyhow::anyhow!(
            "Depth Anything V2 model is required; pass --model <model_quantized.onnx> \
             or set FLATKEY_DEPTH_MODEL (official model: {MODEL_URL})"
        ))?;
    if !model.is_file() {
        bail!("Depth Anything V2 model does not exist: {}", model.display());
    }

    let (width, height, fps) = probe_video(&args.source)?;
    let (output_width, output_height) = output_size(width, height, &args.resolution);
    let decoder = spawn_decoder(&args.source)?;
    let encoder = spawn_encoder(&args.output, output_width, output_height, fps)?;
    let mut session = Session::builder()?.commit_from_file(&model)?;
    infer_frames(
        decoder,
        encoder,
        &mut session,
        output_width,
        output_height,
        args.frame_ratio,
    )?;

    println!(
        "{}",
        serde_json::to_string(&ResultJson {
            output: args.output,
            frame_ratio: args.frame_ratio,
            resolution: args.resolution,
            model: model.display().to_string(),
            inference: "depth-anything-v2-small-onnx".to_string(),
        })?
    );
    Ok(())
}

fn probe_video(path: &Path) -> Result<(u32, u32, f64)> {
    let out = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate",
            "-of", "csv=p=0",
        ])
        .arg(path)
        .output()
        .with_context(|| "failed to start ffprobe")?;
    if !out.status.success() {
        bail!("ffprobe failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    let fields: Vec<_> = String::from_utf8_lossy(&out.stdout)
        .trim()
        .split(',')
        .map(str::to_owned)
        .collect();
    if fields.len() < 3 {
        bail!("ffprobe returned invalid video metadata");
    }
    Ok((fields[0].parse()?, fields[1].parse()?, parse_rate(&fields[2])?))
}

fn parse_rate(value: &str) -> Result<f64> {
    if let Some((a, b)) = value.split_once('/') {
        return Ok(a.parse::<f64>()? / b.parse::<f64>()?);
    }
    Ok(value.parse()?)
}

fn output_size(width: u32, height: u32, resolution: &str) -> (u32, u32) {
    let max_height = match resolution {
        "320p" => Some(320),
        "480p" => Some(480),
        _ => None,
    };
    let Some(max_height) = max_height else {
        return (width, height);
    };
    if height <= max_height {
        return (width, height);
    }
    let scaled_width =
        ((width as f64 * max_height as f64 / height as f64) / 2.0).floor() as u32 * 2;
    (scaled_width.max(2), max_height)
}

fn spawn_decoder(source: &Path) -> Result<Child> {
    let filter = "scale=364:364:flags=lanczos,format=rgb24";
    Command::new("ffmpeg")
        .args(["-v", "error", "-i"])
        .arg(source)
        .args(["-an", "-vf", &filter, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
        .stdout(Stdio::piped())
        .spawn()
        .with_context(|| "failed to start ffmpeg decoder")
}

fn spawn_encoder(output: &Path, width: u32, height: u32, fps: f64) -> Result<Child> {
    let fps_arg = if fps.is_finite() && fps > 0.0 {
        format!("{fps:.6}")
    } else {
        "30".to_string()
    };
    Command::new("ffmpeg")
        .args([
            "-v", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "gray",
            "-s", &format!("{width}x{height}"),
            "-r", &fps_arg, "-i", "-",
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast", "-crf", "18", "-movflags", "+faststart",
        ])
        .arg(output)
        .stdin(Stdio::piped())
        .spawn()
        .with_context(|| "failed to start ffmpeg encoder")
}

fn infer_frames(
    mut decoder: Child,
    mut encoder: Child,
    session: &mut Session,
    output_width: u32,
    output_height: u32,
    frame_ratio: u8,
) -> Result<()> {
    let mut input = decoder.stdout.take().context("decoder stdout unavailable")?;
    let mut encoded = encoder.stdin.take().context("encoder stdin unavailable")?;
    let frame_bytes = (MODEL_INPUT * MODEL_INPUT * 3) as usize;
    let mut frame = vec![0_u8; frame_bytes];
    let mut last_frame = vec![0_u8; frame_bytes];
    let mut previous_depth: Option<Vec<u8>> = None;
    let mut previous_index = 0_u64;
    let mut frame_index = 0_u64;
    let mut selection_accumulator = 100_u16;

    loop {
        let mut read = 0;
        while read < frame.len() {
            let count = input.read(&mut frame[read..])?;
            if count == 0 {
                break;
            }
            read += count;
        }
        if read == 0 {
            break;
        }
        if read != frame.len() {
            bail!("decoder ended with a partial RGB frame");
        }

        last_frame.copy_from_slice(&frame);
        selection_accumulator += frame_ratio as u16;
        let selected = selection_accumulator >= 100;
        if selected {
            selection_accumulator -= 100;
            let depth = infer_depth(&frame, session, output_width, output_height)?;
            if let Some(previous) = previous_depth.replace(depth) {
                write_repeated(&mut encoded, &previous, frame_index - previous_index)?;
            }
            previous_index = frame_index;
        }
        frame_index += 1;
    }

    if frame_index > 0 {
        let last_index = frame_index - 1;
        if previous_index != last_index {
            let last_depth = infer_depth(&last_frame, session, output_width, output_height)?;
            if let Some(previous) = previous_depth.take() {
                write_repeated(&mut encoded, &previous, last_index - previous_index)?;
            }
            encoded.write_all(&last_depth)?;
        } else if let Some(previous) = previous_depth.take() {
            write_repeated(&mut encoded, &previous, 1)?;
        }
    }

    drop(encoded);
    if !decoder.wait()?.success() {
        bail!("ffmpeg decoder failed");
    }
    if !encoder.wait()?.success() {
        bail!("ffmpeg encoder failed");
    }
    Ok(())
}

fn infer_depth(
    frame: &[u8],
    session: &mut Session,
    output_width: u32,
    output_height: u32,
) -> Result<Vec<u8>> {
    let plane = (MODEL_INPUT * MODEL_INPUT) as usize;
    let mut chw = vec![0_f32; plane * 3];
    for index in 0..plane {
        let pixel = index * 3;
        chw[index] = (frame[pixel] as f32 / 255.0 - 0.485) / 0.229;
        chw[plane + index] = (frame[pixel + 1] as f32 / 255.0 - 0.456) / 0.224;
        chw[2 * plane + index] = (frame[pixel + 2] as f32 / 255.0 - 0.406) / 0.225;
    }

    let tensor = Tensor::from_array(Array4::from_shape_vec(
        (1, 3, MODEL_INPUT as usize, MODEL_INPUT as usize),
        chw,
    )?)?;
    let outputs = session.run(ort::inputs!["pixel_values" => tensor])?;
    let (shape, data) = outputs[0].try_extract_tensor::<f32>()?;
    let depth_height = shape[shape.len() - 2] as u32;
    let depth_width = shape[shape.len() - 1] as u32;
    let (mut min, mut max) = (f32::INFINITY, f32::NEG_INFINITY);
    for value in data.iter().copied() {
        min = min.min(value);
        max = max.max(value);
    }
    let range = (max - min).max(1e-6);
    let mut image = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(depth_width, depth_height);
    for (index, pixel) in image.pixels_mut().enumerate() {
        let value = ((data[index] - min) / range * 255.0).clamp(0.0, 255.0) as u8;
        *pixel = Rgb([value, value, value]);
    }
    let resized = DynamicImage::ImageRgb8(image).resize_exact(
        output_width,
        output_height,
        FilterType::Lanczos3,
    );
    Ok(resized.to_luma8().into_raw())
}

fn write_repeated(output: &mut impl Write, frame: &[u8], count: u64) -> Result<()> {
    for _ in 0..count {
        output.write_all(frame)?;
    }
    Ok(())
}
