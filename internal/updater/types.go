package updater

type ReleaseState struct {
	CurrentVersion     string `json:"currentVersion"`
	CurrentReleaseHash string `json:"currentReleaseHash"`
	LastCheckedAt      string `json:"lastCheckedAt"`
	LastInstalledAt    string `json:"lastInstalledAt"`
}

type UpdateCheckResult struct {
	CurrentVersion     string `json:"currentVersion"`
	CurrentReleaseHash string `json:"currentReleaseHash"`
	LatestVersion      string `json:"latestVersion"`
	LatestReleaseHash  string `json:"latestReleaseHash"`
	ReleaseName        string `json:"releaseName"`
	ReleaseURL         string `json:"releaseUrl"`
	PublishedAt        string `json:"publishedAt"`
	AssetName          string `json:"assetName"`
	AssetSize          int64  `json:"assetSize"`
	AssetDigest        string `json:"assetDigest"`
	UpdateAvailable    bool   `json:"updateAvailable"`
	CanInstall         bool   `json:"canInstall"`
	Message            string `json:"message"`
}

type InstallUpdateRequest struct {
	AssetName string `json:"assetName"`
}

type InstallUpdateResult struct {
	Restarting bool   `json:"restarting"`
	Message    string `json:"message"`
}

type githubRelease struct {
	TagName      string        `json:"tag_name"`
	TargetCommit string        `json:"target_commitish"`
	Name         string        `json:"name"`
	HTMLURL      string        `json:"html_url"`
	PublishedAt  string        `json:"published_at"`
	Draft        bool          `json:"draft"`
	Prerelease   bool          `json:"prerelease"`
	Assets       []githubAsset `json:"assets"`
}

type githubAsset struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	Digest             string `json:"digest"`
	BrowserDownloadURL string `json:"browser_download_url"`
}
