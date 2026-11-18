#!/usr/bin/env bash
# 把仓库内的 skills/po-workbench-entry 安装到本机用户级技能目录（软链接）。
# 仓库是唯一真源：改仓库里的技能文件，立即生效；不需要重新安装。
#
# 用法：
#   bash scripts/install-skill.sh                  # 默认装到 ~/Doubao/skills
#   bash scripts/install-skill.sh --target <目录>   # 指定目录，例如：
#                                                  #   "$HOME/Library/Application Support/Doubao/Profile 1/.doubao/agent_mode/workspace/.user_skills"
#   bash scripts/install-skill.sh --uninstall      # 删除已安装的软链接（不动仓库文件）
#   bash scripts/install-skill.sh --force          # 目标已存在时覆盖（会先备份成 .bak-<时间戳>）

set -euo pipefail

SKILL_NAME="po-workbench-entry"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
SRC_DIR="${REPO_DIR}/skills/${SKILL_NAME}"

TARGET_DIR="${PO_SKILL_DIR:-${HOME}/Doubao/skills}"
TARGET_PATH=""
MODE="install"
FORCE="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || { echo "错误：--target 需要一个目录参数"; exit 1; }
      TARGET_DIR="$2"; shift 2 ;;
    --uninstall)
      MODE="uninstall"; shift ;;
    --force)
      FORCE="1"; shift ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)
      echo "未知参数：$1（用 --help 查看用法）"; exit 1 ;;
  esac
done

TARGET_PATH="${TARGET_DIR}/${SKILL_NAME}"

if [ ! -f "${SRC_DIR}/SKILL.md" ]; then
  echo "错误：找不到技能源文件 ${SRC_DIR}/SKILL.md"
  exit 1
fi

if [ "${MODE}" = "uninstall" ]; then
  if [ -L "${TARGET_PATH}" ] || [ -e "${TARGET_PATH}" ]; then
    rm -rf "${TARGET_PATH}"
    echo "已删除：${TARGET_PATH}"
    echo "仓库内的技能源文件未改动。"
  else
    echo "未安装：${TARGET_PATH} 不存在，无需删除。"
  fi
  exit 0
fi

mkdir -p "${TARGET_DIR}"

if [ -e "${TARGET_PATH}" ] || [ -L "${TARGET_PATH}" ]; then
  # 已经是本仓库的软链接：视为已安装，直接刷新
  if [ -L "${TARGET_PATH}" ]; then
    CURRENT="$(python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]))" "${TARGET_PATH}")"
    if [ "${CURRENT}" = "${SRC_DIR}" ]; then
      echo "已安装，链接正确：${TARGET_PATH} -> ${SRC_DIR}"
      exit 0
    fi
  fi

  if [ "${FORCE}" != "1" ]; then
    echo "目标已存在：${TARGET_PATH}"
    echo "如确认要覆盖（会先备份为 .bak-<时间戳>），加 --force 重新执行。"
    exit 1
  fi

  BAK="${TARGET_PATH}.bak-$(date +%Y%m%d%H%M%S)"
  mv "${TARGET_PATH}" "${BAK}"
  echo "已备份原目标到：${BAK}"
fi

ln -s "${SRC_DIR}" "${TARGET_PATH}"

echo "安装完成：${TARGET_PATH} -> ${SRC_DIR}"
echo
echo "下一步："
echo "  1. 重新开一个会话（技能在会话开始时加载，当前会话不会立即出现）"
echo "  2. 新会话里发一句「你好」，应该能看到三个快捷选项"
echo "  3. 如果没出现，改用别的技能目录重装，例如："
echo "     bash scripts/install-skill.sh --target \"\$HOME/Library/Application Support/Doubao/Profile 1/.doubao/agent_mode/workspace/.user_skills\" --force"
echo "  卸载：bash scripts/install-skill.sh --uninstall"
