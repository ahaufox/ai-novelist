package migration

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// deepMerge 递归合并字典，target 中缺失的键用 source 补全
func deepMerge(target, source map[string]interface{}) {
	for key, srcVal := range source {
		if tgtVal, ok := target[key]; ok {
			// 如果两边都是 map，递归合并
			if tgtMap, ok1 := tgtVal.(map[string]interface{}); ok1 {
				if srcMap, ok2 := srcVal.(map[string]interface{}); ok2 {
					deepMerge(tgtMap, srcMap)
					continue
				}
			}
			// 否则保留 target 现有值
		} else {
			target[key] = srcVal
		}
	}
}

// MigrateYaml 从迁移脚本读取默认值，补全用户配置中缺失的字段
func MigrateYaml(projectPath, configDir, filename, migrationFilename string) error {
	filePath := filepath.Join(projectPath, configDir, filename)
	migrationPath := filepath.Join(projectPath, "scripts", migrationFilename)

	// 读取迁移脚本
	if _, err := os.Stat(migrationPath); os.IsNotExist(err) {
		return nil // 迁移脚本不存在，跳过
	}
	data, err := os.ReadFile(migrationPath)
	if err != nil {
		return fmt.Errorf("读取迁移脚本 %s 失败: %w", migrationFilename, err)
	}
	var defaults map[string]interface{}
	if err := yaml.Unmarshal(data, &defaults); err != nil {
		return fmt.Errorf("解析迁移脚本 %s 失败: %w", migrationFilename, err)
	}

	// 读取用户配置（如存在）
	userConfig := make(map[string]interface{})
	if _, err := os.Stat(filePath); err == nil {
		userData, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("读取用户配置 %s 失败: %w", filename, err)
		}
		if err := yaml.Unmarshal(userData, &userConfig); err != nil {
			return fmt.Errorf("解析用户配置 %s 失败: %w", filename, err)
		}
	}

	// 合并
	deepMerge(userConfig, defaults)

	// 确保目录存在
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	// 写入
	out, err := yaml.Marshal(userConfig)
	if err != nil {
		return fmt.Errorf("序列化配置 %s 失败: %w", filename, err)
	}
	if err := os.WriteFile(filePath, out, 0644); err != nil {
		return fmt.Errorf("写入配置 %s 失败: %w", filename, err)
	}
	return nil
}

// MigrateDotfiles 只检查 dotfiles 是否存在，不存在则按迁移脚本创建
func MigrateDotfiles(projectPath, dataDir string) error {
	migrationPath := filepath.Join(projectPath, "scripts", "dotfiles_migration.yaml")
	if _, err := os.Stat(migrationPath); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(migrationPath)
	if err != nil {
		return fmt.Errorf("读取 dotfiles 迁移脚本失败: %w", err)
	}
	var defaults map[string]string
	if err := yaml.Unmarshal(data, &defaults); err != nil {
		return fmt.Errorf("解析 dotfiles 迁移脚本失败: %w", err)
	}

	// data/ 目录下的 dotfiles
	mapping := map[string]string{
		"aiignore":   ".aiignore",
		"gitignore":  ".gitignore",
		"userignore": ".userignore",
	}

	for key, dstName := range mapping {
		content, ok := defaults[key]
		if !ok {
			continue
		}
		filePath := filepath.Join(projectPath, dataDir, dstName)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return fmt.Errorf("写入 dotfile %s 失败: %w", dstName, err)
			}
		}
	}

	// 项目根目录下的 .env 文件
	// 如果文件不存在则创建，如果存在则补充缺失的键
	if envContent, ok := defaults["env"]; ok {
		envPath := filepath.Join(projectPath, ".env")

		// 读取已有的 .env 文件中已有的键
		existingLines := make(map[string]bool)
		if existingData, err := os.ReadFile(envPath); err == nil {
			for _, line := range strings.Split(string(existingData), "\n") {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
					parts := strings.SplitN(trimmed, "=", 2)
					if len(parts) > 0 {
						existingLines[parts[0]] = true
					}
				}
			}
		}

		// 检查默认 .env 中是否有缺失的键
		missingVars := []string{}
		for _, line := range strings.Split(envContent, "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) > 0 && !existingLines[parts[0]] {
				missingVars = append(missingVars, line)
			}
		}

		// 有缺失的键才需要写入
		if len(missingVars) > 0 {
			// 文件存在则追加，不存在则创建
			flag := os.O_APPEND | os.O_CREATE | os.O_WRONLY
			f, err := os.OpenFile(envPath, flag, 0644)
			if err != nil {
				return fmt.Errorf("打开 .env 失败: %w", err)
			}
			defer f.Close()

			// 如果文件已有内容且不为空行结尾，先加个换行
			if stat, _ := f.Stat(); stat.Size() > 0 {
				// 检查是否以换行结尾
				buf := make([]byte, 1)
				if _, err := f.ReadAt(buf, stat.Size()-1); err == nil && buf[0] != '\n' {
					if _, err := f.WriteString("\n"); err != nil {
						return fmt.Errorf("写入 .env 换行失败: %w", err)
					}
				}
			}

			for _, line := range missingVars {
				if _, err := fmt.Fprintln(f, line); err != nil {
					return fmt.Errorf("写入 .env 失败: %w", err)
				}
			}
		}
	}

	return nil
}

// EnsureDataSubdirs 检查并创建 data 下所有一级文件夹
func EnsureDataSubdirs(projectPath, dataDir string) error {
	expectedDirs := []string{
		"config",
		"chromadb",
		"db",
		"uploads",
		"temp",
		"skills",
	}
	base := filepath.Join(projectPath, dataDir)
	for _, name := range expectedDirs {
		dir := filepath.Join(base, name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建目录 %s 失败: %w", dir, err)
		}
	}
	return nil
}

// RunAll 执行全部迁移
func RunAll(projectPath string) error {
	// store.yaml 迁移
	if err := MigrateYaml(projectPath, "data/config", "store.yaml", "store_migration.yaml"); err != nil {
		return fmt.Errorf("store.yaml 迁移失败: %w", err)
	}
	// skills.yaml 迁移
	if err := MigrateYaml(projectPath, "data/config", "skills.yaml", "skills_migration.yaml"); err != nil {
		return fmt.Errorf("skills.yaml 迁移失败: %w", err)
	}
	// 确保 data 一级目录
	if err := EnsureDataSubdirs(projectPath, "data"); err != nil {
		return fmt.Errorf("data 目录检查失败: %w", err)
	}
	// dotfiles 迁移
	if err := MigrateDotfiles(projectPath, "data"); err != nil {
		return fmt.Errorf("dotfiles 迁移失败: %w", err)
	}
	return nil
}
