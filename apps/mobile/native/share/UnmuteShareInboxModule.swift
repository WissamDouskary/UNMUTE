import Foundation

@objc(UnmuteShareInbox)
class UnmuteShareInbox: NSObject {
  private let appGroupId = "group.com.unmute.app"

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(read:resolver:rejecter:)
  func read(
    _ shareId: String,
    resolver resolve: @escaping (Any?) -> Void,
    rejecter _: @escaping (String?, String?, Error?) -> Void
  ) {
    guard let url = folder(for: shareId)?.appendingPathComponent("manifest.json"),
          let data = try? Data(contentsOf: url),
          let text = String(data: data, encoding: .utf8) else {
      resolve(nil)
      return
    }
    resolve(text)
  }

  @objc(list:rejecter:)
  func list(
    _ resolve: @escaping (Any?) -> Void,
    rejecter _: @escaping (String?, String?, Error?) -> Void
  ) {
    guard let inbox = inboxDirectory(),
          let contents = try? FileManager.default.contentsOfDirectory(
            at: inbox,
            includingPropertiesForKeys: [.isDirectoryKey]
          ) else {
      resolve([])
      return
    }

    let ids = contents.compactMap { url -> String? in
      let name = url.lastPathComponent
      if name.hasPrefix(".") || name.contains("..") {
        return nil
      }
      let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
      return isDirectory ? name : nil
    }
    resolve(ids)
  }

  @objc(fileUri:name:resolver:rejecter:)
  func fileUri(
    _ shareId: String,
    name: String,
    resolver resolve: @escaping (Any?) -> Void,
    rejecter _: @escaping (String?, String?, Error?) -> Void
  ) {
    let fileName = (name as NSString).lastPathComponent
    guard fileName.isEmpty == false, fileName != ".", fileName != "..",
          let url = folder(for: shareId)?.appendingPathComponent(fileName),
          FileManager.default.fileExists(atPath: url.path) else {
      resolve(nil)
      return
    }
    resolve(url.absoluteString)
  }

  @objc(remove:resolver:rejecter:)
  func remove(
    _ shareId: String,
    resolver resolve: @escaping (Any?) -> Void,
    rejecter _: @escaping (String?, String?, Error?) -> Void
  ) {
    if let url = folder(for: shareId) {
      try? FileManager.default.removeItem(at: url)
    }
    resolve(nil)
  }

  private func inboxDirectory() -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
      .appendingPathComponent("Inbox", isDirectory: true)
  }

  private func folder(for shareId: String) -> URL? {
    guard shareId.isEmpty == false, shareId.contains("/") == false, shareId.contains("..") == false else {
      return nil
    }
    return inboxDirectory()?.appendingPathComponent(shareId, isDirectory: true)
  }
}
