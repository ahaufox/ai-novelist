package env

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// LoadDotenv 读取 .env 文件，返回键值对 map
func LoadDotenv(envFile string) (map[string]string, error) {
	f, err := os.Open(envFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vars := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			vars[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return vars, scanner.Err()
}

// SaveDotenv 将缺失的默认变量追加到 .env 文件
// 保留已有内容（包括注释、用户自定义的 API_KEY 等）
func SaveDotenv(envFile string, missingDefaults map[string]string) error {
	// 读取已有内容
	existing := make(map[string]bool)
	var lines []string

	data, err := os.ReadFile(envFile)
	if err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			trimLine := strings.TrimSpace(line)
			if trimLine == "" || strings.HasPrefix(trimLine, "#") {
				lines = append(lines, line)
				continue
			}
			parts := strings.SplitN(trimLine, "=", 2)
			if len(parts) == 2 {
				existing[strings.TrimSpace(parts[0])] = true
			}
			lines = append(lines, line)
		}
	}

	// 追加缺失的默认变量
	if len(missingDefaults) > 0 {
		// 确保最后有空行分隔
		if len(lines) > 0 && lines[len(lines)-1] != "" {
			lines = append(lines, "")
		}
		for key, val := range missingDefaults {
			lines = append(lines, key+"="+val)
		}
	}

	return os.WriteFile(envFile, []byte(strings.Join(lines, "\n")+"\n"), 0644)
}

// EnsureDotenv 确保 .env 存在并包含所有 AI_NOVELIST_* 必需变量
// 返回完整的 .env 键值对（含用户自定义的 API_KEY 等）
func EnsureDotenv(exeDir, projectDir string) (map[string]string, error) {
	envFile := filepath.Join(exeDir, ".env")

	// 1. 确保 .env 文件存在
	if _, err := os.Stat(envFile); os.IsNotExist(err) {
		os.WriteFile(envFile, []byte{}, 0644)
	}

	// 2. 读取现有的 .env 内容
	existing, _ := LoadDotenv(envFile)

	// 3. 计算所有默认值
	defaults := BuildEnvMap(exeDir, projectDir)

	// 4. 找出缺失的 AI_NOVELIST_* 变量
	missing := make(map[string]string)
	for k, v := range defaults {
		if _, ok := existing[k]; !ok {
			missing[k] = v
		}
	}

	// 5. 有缺失就写入 .env
	if len(missing) > 0 {
		if err := SaveDotenv(envFile, missing); err != nil {
			return nil, err
		}
		// 重新读取（获取更新后的完整内容）
		existing, _ = LoadDotenv(envFile)
	}

	// 6. 确保所有默认值在返回 map 中都存在（防止用户误删）
	for k, v := range defaults {
		if _, ok := existing[k]; !ok {
			existing[k] = v
		}
	}

	return existing, nil
}
