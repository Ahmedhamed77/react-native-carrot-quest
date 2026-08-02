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
  s.source       = { :git => "https://github.com/ticketscloud/react-native-carrot-quest.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{m,mm}",
    "cpp/**/*.{hpp,cpp}",
  ]

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'

  # Allows any 3.x. The public API used here was verified against 3.1.6 and
  # 3.2.1; CarrotquestSDK is a closed-source vendor pod, so pin it yourself in
  # your app's Podfile if you need a specific build.
  s.dependency 'CarrotquestSDK', '~> 3.1'

  load 'nitrogen/generated/ios/CarrotQuest+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
