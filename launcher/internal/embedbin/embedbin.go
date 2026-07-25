package embedbin

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

//go:embed bin.zip
var binZip []byte

// markerFileName 标记文件，存在 = 已成功解压过
const markerFileName = ".embed_extracted"

// BinDir 返回 exe 同级的 bin/ 目录路径
func BinDir(exeDir string) string {
	return filepath.Join(exeDir, "bin")
}

// IsExtracted 判断是否已经解压过（通过标记文件判断）
// 只要标记文件存在，就认为解压已完成，后续不再覆盖
func IsExtracted(exeDir string) bool {
	marker := filepath.Join(BinDir(exeDir), markerFileName)
	_, err := os.Stat(marker)
	return err == nil
}

// Extract 将嵌入的 bin.zip 解压到 exeDir/bin/
// 只在首次启动时调用（IsExtracted == false）
func Extract(exeDir string, progress func(int)) error {
	dstDir := BinDir(exeDir)

	// 确保目标目录存在
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("创建 bin 目录失败: %w", err)
	}

	// 读取嵌入的 zip
	r, err := zip.NewReader(bytes.NewReader(binZip), int64(len(binZip)))
	if err != nil {
		return fmt.Errorf("读取嵌入的 bin.zip 失败: %w", err)
	}

	total := len(r.File)
	for i, f := range r.File {
		target := filepath.Join(dstDir, f.Name)

		// 安全检查：防止 zip slip 攻击
		if !isSubPath(dstDir, target) {
			continue
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0755)
			continue
		}

		// 如果文件已存在，跳过（不覆盖用户下载的已有文件）
		if _, err := os.Stat(target); err == nil {
			continue
		}

		// 创建父目录
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return fmt.Errorf("创建目录 %s 失败: %w", filepath.Dir(target), err)
		}

		// 解压文件
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("打开 zip 中的 %s 失败: %w", f.Name, err)
		}

		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return fmt.Errorf("创建文件 %s 失败: %w", target, err)
		}

		_, err = io.Copy(out, rc)
		rc.Close()
		out.Close()
		if err != nil {
			return fmt.Errorf("写入文件 %s 失败: %w", target, err)
		}

		if progress != nil && total > 0 && i%50 == 0 {
			progress(i * 100 / total)
		}
	}

	// 写入标记文件 — 只有完全成功后才会写入
	marker := filepath.Join(dstDir, markerFileName)
	if err := os.WriteFile(marker, []byte("extracted"), 0644); err != nil {
		return fmt.Errorf("写入标记文件失败: %w", err)
	}

	if progress != nil {
		progress(100)
	}

	return nil
}

// isSubPath 检查 target 是否在 baseDir 之下，防止 zip slip
func isSubPath(baseDir, target string) bool {
	baseDir = filepath.Clean(baseDir)
	target = filepath.Clean(target)
	rel, err := filepath.Rel(baseDir, target)
	if err != nil {
		return false
	}
	return len(rel) < len(target) || rel == "."
}
