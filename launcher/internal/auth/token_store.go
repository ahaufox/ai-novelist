package auth

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// TokenStore 管理 access_token / refresh_token 的持久化
// 存储路径由环境变量 AI_NOVELIST_AUTH_TOKEN_FILE 指定
// 与主 Python 后端完全一致，确保互不冲突
type TokenStore struct {
	tokenFile string
}

// tokenData 序列化结构
type tokenData struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// NewTokenStore 创建 TokenStore
// tokenFile: tokens.json 的完整路径
func NewTokenStore(tokenFile string) *TokenStore {
	return &TokenStore{tokenFile: tokenFile}
}

// Save 持久化 token
func (s *TokenStore) Save(accessToken, refreshToken string) error {
	dir := filepath.Dir(s.tokenFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data := tokenData{AccessToken: accessToken}
	if refreshToken != "" {
		data.RefreshToken = refreshToken
	}

	tmp := s.tokenFile + ".tmp"
	if err := writeJSON(tmp, data); err != nil {
		return err
	}
	return os.Rename(tmp, s.tokenFile)
}

// Load 读取持久化的 token
func (s *TokenStore) Load() (accessToken, refreshToken string) {
	if _, err := os.Stat(s.tokenFile); os.IsNotExist(err) {
		return "", ""
	}

	var data tokenData
	if err := readJSON(s.tokenFile, &data); err != nil {
		return "", ""
	}
	return data.AccessToken, data.RefreshToken
}

// Clear 清除 token 文件
func (s *TokenStore) Clear() error {
	if _, err := os.Stat(s.tokenFile); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(s.tokenFile)
}

func writeJSON(path string, v interface{}) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(v)
}

func readJSON(path string, v interface{}) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}
