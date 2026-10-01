require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "CarrotQuest"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Ahmedhamed77/react-native-carrot-quest.git", :tag => "v#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{m,mm}",
    "cpp/**/*.{hpp,cpp}",
  ]

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'

  # 3.4+ is required: the log sink and diagnostics API the bridge uses
  # (`setLogSink`, `getDiagnostics`) first shipped there. The public API used
  # here was verified against 3.4.0; CarrotquestSDK is a closed-source vendor
  # pod, so pin it yourself in your app's Podfile if you need a specific build.
  s.dependency 'CarrotquestSDK', '~> 3.4'

  load 'nitrogen/generated/ios/CarrotQuest+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
