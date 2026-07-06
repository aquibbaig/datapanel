cask "datapanel" do
  version :latest
  sha256 :no_check

  url "https://github.com/aquibbaig/datapanel/releases/latest/download/DataPanel-macOS.zip",
      verified: "github.com/aquibbaig/datapanel/"
  name "DataPanel"
  desc "Desktop database workspace for querying, inspecting, and editing data"
  homepage "https://github.com/aquibbaig/datapanel"

  app "DataPanel.app"

  uninstall_postflight do
    begin
      require "json"
      require "net/http"
      require "time"
      require "uri"

      settings_path = File.expand_path("~/Library/Application Support/datapanel/settings.json")
      settings = File.file?(settings_path) ? JSON.parse(File.read(settings_path)) : {}
      user_id = settings["userId"].to_s.strip

      if settings["telemetryEnabled"] == true && !user_id.empty?
        posthog_token = "phc_wGsopSafUkaBkGME8r5u8k5TAc5VSjXsb3pf3oxqm4cd"
        posthog_host = "https://us.i.posthog.com"
        uri = URI("#{posthog_host}/i/v0/e/")
        request = Net::HTTP::Post.new(uri)
        request["Content-Type"] = "application/json"
        request.body = {
          api_key: posthog_token,
          event: "datapanel_uninstalled",
          distinct_id: user_id,
          properties: {
            "$process_person_profile": false,
            app: "datapanel",
            userId: user_id,
            source: "homebrew_cask_uninstall",
          },
          timestamp: Time.now.utc.iso8601,
        }.to_json

        http_client = Net::HTTP.new(uri.host, uri.port)
        http_client.use_ssl = uri.scheme == "https"
        http_client.open_timeout = 2
        http_client.read_timeout = 2
        http_client.start do |http|
          http.request(request)
        end
      end
    rescue StandardError
      nil
    end

    begin
      require "fileutils"

      FileUtils.rm_rf(File.expand_path("~/Library/Caches/datapanel/telemetry"))
    rescue StandardError
      nil
    end
  end

  caveats <<~EOS
    DataPanel is currently unsigned. If macOS blocks it on first launch, open
    System Settings > Privacy & Security and choose Open Anyway for DataPanel.

    Technical users can also clear quarantine with:
      xattr -dr com.apple.quarantine #{appdir}/DataPanel.app
  EOS

  zap trash: [
    "~/Library/Application Support/datapanel",
    "~/Library/Caches/datapanel",
    "~/Library/Preferences/datapanel.plist",
    "~/Library/Saved Application State/datapanel.savedState",
  ]
end
