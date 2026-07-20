package migration

import (
	"fmt"
	"os"
	"path/filepath"
)

// CopyMigrationFolder 将项目根目录下的 migration/ 文件夹复制到 data/migration/
// 后续所有配置同步工作交由管家 agent 手动处理，不再程序化 deep-merge。
//
// projectDir: 项目代码目录（qingzhu/）
// dataDir:    数据目录（exeDir/data/）
func CopyMigrationFolder(projectDir, dataDir string) error {
	srcDir := filepath.Join(projectDir, "migration")
	dstDir := filepath.Join(dataDir, "migration")

	// 源目录不存在则跳过
	if _, err := os.Stat(srcDir); os.IsNotExist(err) {
		return nil
	}

	// 删除目标目录（如有），确保完全覆盖
	if err := os.RemoveAll(dstDir); err != nil {
		return fmt.Errorf("清理旧 migration 目录失败: %w", err)
	}

	// 递归复制
	if err := copyDir(srcDir, dstDir); err != nil {
		return fmt.Errorf("复制 migration 目录失败: %w", err)
	}

	fmt.Printf("[迁移] migration 配置模板已复制到: %s\n", dstDir)
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
