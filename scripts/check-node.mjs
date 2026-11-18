/**
 * Node 版本校验脚本。
 * antd 6 的图标依赖链路在测试环境中需要 Node 支持 require(ESM)，
 * Node 20.19+ 或 22.12+ 才具备该能力，提前给出明确提示避免报错难以理解。
 */
const [major, minor] = process.versions.node.split('.').map(Number)

const supported = major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)

if (!supported) {
  console.error(
    `当前 Node 版本为 v${process.versions.node}，版本过低。\n` +
      '请切换到 Node 20.19+ 或 22.12+ 后再运行测试，例如：nvm use 22',
  )
  process.exit(1)
}
