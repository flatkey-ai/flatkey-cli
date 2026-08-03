# Agent Log

- 目标：修复测试并按要求不展示用户/令牌 ID。
- 修改文件：
  - `src/cli.js`
    - 登录 JSON 返回中移除对外展示的 `userId/tokenId`。
    - `status` 合并账户信息后统一清洗，避免返回 `account.userId`。
    - 新增 `stripDisplayOnlyIds()` 用于展示层字段脱敏。
  - `test/cli.test.js`
    - 调整登录复用场景断言，不再校验返回 `userId` 与 `tokenId`，改为校验不含这些字段。

- 回归结果：
  - 执行 `npm test`
  - `pass 93 / fail 0 / skip 9`（共 102）
