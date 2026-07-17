class Flatkey < Formula
  desc "Flatkey media generation CLI"
  homepage "https://github.com/flatkey-ai/flatkey-cli"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", "-g", "@flatkey-ai/cli", "--prefix", libexec
    bin.install_symlink Dir["#{libexec}/bin/flatkey"].first
  end

  test do
    system "#{bin}/flatkey", "help", "--ai"
  end
end
