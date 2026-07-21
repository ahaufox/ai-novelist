package migration

import (
	"fmt"
	"os"
	"path/filepath"
)

// CopyBuiltinSkill 将项目根目录下的 backend-skill/ 文件夹复制到 data/skills/backend-skill/
// 每次启动时执行，确保管家 agent 能拿到最新的 skill 定义和迁移模板。
//
// 原有复杂的程序化 deep-merge 迁移逻辑已废弃，改为：
//   - 启动时复制 backend-skill/ → data/skills/（已存在则完全替换）
//   - 配置迁移工作交由管家 agent 根据 skill 中的「配置迁移」说明手动操作
//
// projectDir: 项目代码目录（qingzhu/）
// dataDir:    数据目录（exeDir/data/）
func CopyBuiltinSkill(projectDir, dataDir string) error {
	srcDir := filepath.Join(projectDir, "backend-skill")
	dstDir := filepath.Join(dataDir, "skills", "backend-skill")

	// 源目录不存在则跳过
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		return nil
	}

	// 删除目标目录（如有），确保完全覆盖
	if err := os.RemoveAll(dstDir); err != nil {
		return fmt.Errorf("清理旧 backend-skill 目录失败: %w", err)
	}

	// 递归复制
	if err := copyDir(srcDir, dstDir); err != nil {
		return fmt.Errorf("复制 backend-skill 目录失败: %w", err)
	}

	fmt.Printf("[迁移] backend-skill 已复制到: %s\n", dstDir)
	return nil
}

// ensureFromTemplate 通用函数：将模板文件复制到目标路径（目标不存在时）
func ensureFromTemplate(src, dst string, logger func(string, ...interface{})) error {
	if _, err := os.Stat(dst); err == nil {
		return nil // 已存在，跳过
	}
	if _, err := os.Stat(src); os.IsNotExist(err) {
		if logger != nil {
			logger("模板不存在，跳过: %s", src)
		}
		return nil
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("读取模板失败 %s: %w", src, err)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return fmt.Errorf("创建目录失败 %s: %w", filepath.Dir(dst), err)
	}
	if err := os.WriteFile(dst, data, 0644); err != nil {
		return fmt.Errorf("写入文件失败 %s: %w", dst, err)
	}
	fmt.Printf("[迁移] 已创建文件: %s\n", dst)
	return nil
}

// EnsureStoreConfig 确保 data/config/store.yaml 存在，不存在则从项目源码模板创建
func EnsureStoreConfig(projectDir, dataDir string) error {
	src := filepath.Join(projectDir, "backend-skill", "references", "store_migration.yaml")
	dst := filepath.Join(dataDir, "config", "store.yaml")
	return ensureFromTemplate(src, dst, nil)
}

// EnsureSkillsConfig 确保 data/config/skills.yaml 存在，不存在则从模板创建
func EnsureSkillsConfig(projectDir, dataDir string) error {
	src := filepath.Join(projectDir, "backend-skill", "references", "skills_migration.yaml")
	dst := filepath.Join(dataDir, "config", "skills.yaml")
	return ensureFromTemplate(src, dst, nil)
}

// dotfiles 列表：源文件 → 目标文件名（相对于 dataDir）
var dotfiles = []struct{ srcName, dstName string }{
	{".aiignore", ".aiignore"},
	{".gitignore", ".gitignore"},
	{".userignore", ".userignore"},
}

// EnsureDotfiles 确保 data/ 下的 .aiignore/.userignore/.gitignore 存在
// 不存在则从 backend-skill/references/ 直接复制
func EnsureDotfiles(projectDir, dataDir string) error {
	refDir := filepath.Join(projectDir, "backend-skill", "references")

	for _, f := range dotfiles {
		dst := filepath.Join(dataDir, f.dstName)
		if _, err := os.Stat(dst); err == nil {
			continue // 已存在，跳过
		}
		src := filepath.Join(refDir, f.srcName)
		data, err := os.ReadFile(src)
		if err != nil {
			return fmt.Errorf("读取 %s 失败: %w", src, err)
		}
		if err := os.WriteFile(dst, data, 0644); err != nil {
			return fmt.Errorf("写入 %s 失败: %w", dst, err)
		}
		fmt.Printf("[迁移] 已创建默认文件: %s\n", dst)
	}
	return nil
}

// copyDir 递归复制 dir 到 dst
func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return fmt.Errorf("创建目录 %s 失败: %w", dst, err)
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return fmt.Errorf("读取源目录 %s 失败: %w", src, err)
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return fmt.Errorf("读取文件 %s 失败: %w", srcPath, err)
			}
			if err := os.WriteFile(dstPath, data, 0644); err != nil {
				return fmt.Errorf("写入文件 %s 失败: %w", dstPath, err)
			}
		}
	}
	return nil
}
