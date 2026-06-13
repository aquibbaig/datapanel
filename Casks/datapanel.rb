cask "datapanel" do
  version :latest
  sha256 :no_check

  url "https://github.com/aquibbaig/datapanel/releases/latest/download/Datapanel-macOS.zip",
      verified: "github.com/aquibbaig/datapanel/"
  name "Datapanel"
  desc "Desktop database workspace for querying, inspecting, and editing data"
  homepage "https://github.com/aquibbaig/datapanel"

  app "datapanel.app", target: "Datapanel.app"

  caveats <<~EOS
    Datapanel is currently unsigned. If macOS blocks it on first launch, open
    System Settings > Privacy & Security and choose Open Anyway for Datapanel.

    Technical users can also clear quarantine with:
      xattr -dr com.apple.quarantine #{appdir}/Datapanel.app
  EOS

  zap trash: [
    "~/Library/Application Support/datapanel",
    "~/Library/Caches/datapanel",
    "~/Library/Preferences/datapanel.plist",
    "~/Library/Saved Application State/datapanel.savedState",
  ]
end
