import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
  private let appGroupId = "group.com.unmute.app"

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    Task { await receiveShare() }
  }

  private func receiveShare() async {
    let id = UUID().uuidString
    try? await stage(id: id)
    await MainActor.run {
      handOff(id: id)
    }
  }

  private func stage(id: String) async throws {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      return
    }

    let folder = container
      .appendingPathComponent("Inbox", isDirectory: true)
      .appendingPathComponent(id, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

    let item = extensionContext?.inputItems.first as? NSExtensionItem
    let title = item?.attributedTitle?.string.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var text = item?.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var sharedURL = ""
    var files: [[String: String]] = []
    var copiedFile = false

    for provider in item?.attachments ?? [] {
      switch classify(provider) {
      case .file:
        let name = safeFileName(provider.suggestedName ?? defaultFileName(provider))
        files.append(["name": name, "type": mimeType(for: provider)])
        if !copiedFile {
          let destination = folder.appendingPathComponent(name)
          copiedFile = await copyFile(provider, to: destination)
        }
      case .url:
        let loaded = await loadURL(provider)
        if sharedURL.isEmpty {
          sharedURL = loaded
        }
      case .text:
        let loaded = await loadText(provider).trimmingCharacters(in: .whitespacesAndNewlines)
        if !loaded.isEmpty {
          text = loaded
        }
      }
    }

    if files.isEmpty {
      let body = [title, text, sharedURL]
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "\n\n")
      if !body.isEmpty {
        if text.isEmpty {
          text = body
        }
        let shareText = folder.appendingPathComponent("share.txt")
        try Data(body.utf8).write(to: shareText, options: .atomic)
      }
    }

    let manifest: [String: Any] = [
      "id": id,
      "title": title,
      "text": text,
      "url": sharedURL,
      "files": files,
      "notice": NSNull(),
    ]
    let data = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: folder.appendingPathComponent("manifest.json"), options: .atomic)
  }

  private func handOff(id: String) {
    let captureURL = URL(string: "unmute://capture?id=\(id)")!
    extensionContext?.open(captureURL) { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
  }

  private enum AttachmentKind {
    case file
    case url
    case text
  }

  private func classify(_ provider: NSItemProvider) -> AttachmentKind {
    if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
      || provider.hasItemConformingToTypeIdentifier(UTType.image.identifier)
      || provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier)
      || provider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) {
      return .file
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      return .url
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
      || provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
      return .text
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) {
      return .file
    }
    return .text
  }

  private func defaultFileName(_ provider: NSItemProvider) -> String {
    if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) { return "share.pdf" }
    if provider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) { return "share.m4a" }
    if provider.hasItemConformingToTypeIdentifier(UTType.png.identifier) { return "share.png" }
    if provider.hasItemConformingToTypeIdentifier(UTType.jpeg.identifier) { return "share.jpg" }
    if provider.hasItemConformingToTypeIdentifier(UTType.webP.identifier) { return "share.webp" }
    return "share.bin"
  }

  private func safeFileName(_ name: String) -> String {
    let base = (name as NSString).lastPathComponent
    if base.isEmpty || base == "." || base == ".." {
      return "share.bin"
    }
    return base
  }

  private func mimeType(for provider: NSItemProvider) -> String {
    for identifier in provider.registeredTypeIdentifiers {
      if let type = UTType(identifier), let mime = type.preferredMIMEType, mime != "application/octet-stream" {
        return mime
      }
    }
    return "application/octet-stream"
  }

  private func typeIdentifier(for provider: NSItemProvider) -> String {
    let preferred = [UTType.image, UTType.pdf, UTType.audio, UTType.fileURL, UTType.data].map(\.identifier)
    return preferred.first { provider.hasItemConformingToTypeIdentifier($0) }
      ?? provider.registeredTypeIdentifiers.first
      ?? UTType.data.identifier
  }

  private func copyFile(_ provider: NSItemProvider, to destination: URL) async -> Bool {
    let typeIdentifier = typeIdentifier(for: provider)
    return await withCheckedContinuation { continuation in
      var resumed = false
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { source, _ in
        guard !resumed else { return }
        resumed = true
        guard let source else {
          continuation.resume(returning: false)
          return
        }
        do {
          if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
          }
          try FileManager.default.copyItem(at: source, to: destination)
          continuation.resume(returning: true)
        } catch {
          continuation.resume(returning: false)
        }
      }
    }
  }

  private func loadText(_ provider: NSItemProvider) async -> String {
    let typeIdentifier = provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
      ? UTType.plainText.identifier
      : UTType.text.identifier
    return await loadItem(provider, typeIdentifier: typeIdentifier) { item in
      if let text = item as? String { return text }
      if let data = item as? Data { return String(data: data, encoding: .utf8) ?? "" }
      if let url = item as? URL { return (try? String(contentsOf: url)) ?? "" }
      return ""
    }
  }

  private func loadURL(_ provider: NSItemProvider) async -> String {
    await loadItem(provider, typeIdentifier: UTType.url.identifier) { item in
      if let url = item as? URL { return url.absoluteString }
      if let text = item as? String { return text }
      return ""
    }
  }

  private func loadItem(
    _ provider: NSItemProvider,
    typeIdentifier: String,
    map: @escaping (NSSecureCoding?) -> String
  ) async -> String {
    await withCheckedContinuation { continuation in
      var resumed = false
      provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, _ in
        guard !resumed else { return }
        resumed = true
        continuation.resume(returning: map(item))
      }
    }
  }
}
