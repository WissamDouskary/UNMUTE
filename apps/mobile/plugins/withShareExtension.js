const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  createRunOncePlugin,
  withEntitlementsPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

const APP_GROUP = 'group.com.unmute.app';
const EXTENSION_NAME = 'UNMUTEShare';
const EXTENSION_BUNDLE_ID = 'com.unmute.app.share';
const EXTENSION_DISPLAY_NAME = 'UNMUTE Share';
const SOURCE_DIR = ['native', 'share'];
const MAIN_TARGET_FILES = ['UnmuteShareInboxModule.swift', 'UnmuteShareInboxModule.m'];
const EXTENSION_SOURCE_FILES = ['ShareViewController.swift'];

const APP_GROUP_KEY = 'com.apple.security.application-groups';

function withShareAppGroup(config) {
  return withEntitlementsPlist(config, (config) => {
    const current = config.modResults[APP_GROUP_KEY];
    const groups = Array.isArray(current) ? current.filter((value) => typeof value === 'string') : [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    config.modResults[APP_GROUP_KEY] = groups;
    return config;
  });
}

function unquote(value) {
  return String(value ?? '').replace(/^"|"$/g, '');
}

function findNativeTarget(project, name) {
  const section = project.pbxNativeTargetSection();
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    if (unquote(section[key].name) === name) {
      return { uuid: key, target: section[key] };
    }
  }
  return null;
}

function applicationTarget(project) {
  const section = project.pbxNativeTargetSection();
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    if (unquote(section[key].productType) === 'com.apple.product-type.application') {
      return { uuid: key, target: section[key] };
    }
  }
  const first = project.getFirstTarget();
  return { uuid: first.uuid, target: first.firstTarget };
}

function configurationListId(target) {
  const list = target.buildConfigurationList;
  if (list && typeof list === 'object' && list.value) {
    return list.value;
  }
  return unquote(list);
}

function targetBuildConfigs(project, target) {
  const list = project.pbxXCConfigurationList()[configurationListId(target)];
  if (!list) return [];
  const configs = project.pbxXCBuildConfigurationSection();
  return list.buildConfigurations.map((item) => configs[item.value]).filter(Boolean);
}

function ensurePhase(project, targetUuid, target, isa, comment) {
  const phases = target.buildPhases || [];
  if (phases.some((phase) => phase.comment === comment)) {
    return;
  }
  project.addBuildPhase([], isa, comment, targetUuid);
}

function ensureGroup(project, name, groupPath) {
  const { firstProject } = project.getFirstProject();
  const main = project.getPBXGroupByKey(firstProject.mainGroup);
  const existing = (main.children || []).find((child) => child.comment === name);
  if (existing) {
    const group = project.getPBXGroupByKey(existing.value);
    if (group && !group.path) {
      group.path = `"${groupPath}"`;
    }
    return group;
  }

  const uuid = project.pbxCreateGroup(name, `"${groupPath}"`);
  const group = project.getPBXGroupByKey(uuid);
  if (group) {
    group.isa = 'PBXGroup';
  }
  main.children.push({ value: uuid, comment: name });
  return group;
}

function stripUndefined(project) {
  const sections = project.hash.project.objects;
  for (const section of Object.values(sections)) {
    if (!section || typeof section !== 'object') continue;
    for (const entry of Object.values(section)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      for (const field of Object.keys(entry)) {
        if (entry[field] === undefined) {
          delete entry[field];
        }
      }
    }
  }
}

function addFileReference(project, group, filename) {
  if ((group.children || []).some((child) => child.comment === filename)) {
    return;
  }
  const PBXFile = require('xcode/lib/pbxFile');
  const file = new PBXFile(filename);
  file.uuid = project.generateUuid();
  file.fileRef = project.generateUuid();
  project.addToPbxFileReferenceSection(file);
  group.children.push({ value: file.fileRef, comment: file.basename });
}

function addSource(project, groupName, filename, targetUuid) {
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
    filepath: filename,
    groupName,
    project,
    targetUuid,
  });
}

function copyInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function extensionEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>${APP_GROUP_KEY}</key>
	<array>
		<string>${APP_GROUP}</string>
	</array>
</dict>
</plist>
`;
}

function applyExtensionSettings(project, extensionTarget, appTarget) {
  const appConfigs = targetBuildConfigs(project, appTarget);
  const extensionConfigs = targetBuildConfigs(project, extensionTarget);
  const inherited = [
    'IPHONEOS_DEPLOYMENT_TARGET',
    'TARGETED_DEVICE_FAMILY',
    'DEVELOPMENT_TEAM',
    'CODE_SIGN_STYLE',
    'SWIFT_VERSION',
    'MARKETING_VERSION',
    'CURRENT_PROJECT_VERSION',
  ];

  extensionConfigs.forEach((config, index) => {
    const source = appConfigs[index] || appConfigs[0];
    inherited.forEach((key) => {
      if (source?.buildSettings?.[key] !== undefined) {
        config.buildSettings[key] = source.buildSettings[key];
      }
    });
    config.buildSettings.INFOPLIST_FILE = '"UNMUTEShare/Info.plist"';
    config.buildSettings.CODE_SIGN_ENTITLEMENTS = '"UNMUTEShare/UNMUTEShare.entitlements"';
    config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${EXTENSION_BUNDLE_ID}"`;
    config.buildSettings.PRODUCT_NAME = `"${EXTENSION_NAME}"`;
    config.buildSettings.SKIP_INSTALL = 'YES';
    config.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
    config.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
    config.buildSettings.CLANG_ENABLE_MODULES = 'YES';
    if (!config.buildSettings.SWIFT_VERSION) {
      config.buildSettings.SWIFT_VERSION = '5.0';
    }
    config.buildSettings.LD_RUNPATH_SEARCH_PATHS =
      '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
    config.buildSettings.INFOPLIST_KEY_CFBundleDisplayName = `"${EXTENSION_DISPLAY_NAME}"`;
  });
}

function ensureShareExtension(project, { projectRoot, platformProjectRoot }) {
  const sourceDir = path.join(projectRoot, ...SOURCE_DIR);
  const extensionDir = path.join(platformProjectRoot, EXTENSION_NAME);
  const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
  const appDir = path.join(platformProjectRoot, projectName);

  EXTENSION_SOURCE_FILES.concat(['Info.plist']).forEach((filename) => {
    copyInto(path.join(sourceDir, filename), path.join(extensionDir, filename));
  });
  MAIN_TARGET_FILES.forEach((filename) => {
    copyInto(path.join(sourceDir, filename), path.join(appDir, filename));
  });
  fs.writeFileSync(path.join(extensionDir, `${EXTENSION_NAME}.entitlements`), extensionEntitlements());

  const app = applicationTarget(project);
  let extension = findNativeTarget(project, EXTENSION_NAME);
  if (!extension) {
    const created = project.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, EXTENSION_BUNDLE_ID);
    extension = { uuid: created.uuid, target: project.pbxNativeTargetSection()[created.uuid] };
  }

  ensurePhase(project, extension.uuid, extension.target, 'PBXSourcesBuildPhase', 'Sources');
  ensurePhase(project, extension.uuid, extension.target, 'PBXResourcesBuildPhase', 'Resources');
  ensurePhase(project, extension.uuid, extension.target, 'PBXFrameworksBuildPhase', 'Frameworks');
  applyExtensionSettings(project, extension.target, app.target);

  const extensionGroup = ensureGroup(project, EXTENSION_NAME, EXTENSION_NAME);
  EXTENSION_SOURCE_FILES.forEach((filename) => {
    addSource(project, EXTENSION_NAME, filename, extension.uuid);
  });
  addFileReference(project, extensionGroup, 'Info.plist');
  addFileReference(project, extensionGroup, `${EXTENSION_NAME}.entitlements`);

  MAIN_TARGET_FILES.forEach((filename) => {
    addSource(project, projectName, filename, app.uuid);
  });

  stripUndefined(project);
  return project;
}

function withShareExtension(config) {
  config = withShareAppGroup(config);
  config = withXcodeProject(config, (config) => {
    config.modResults = ensureShareExtension(config.modResults, {
      projectRoot: config.modRequest.projectRoot,
      platformProjectRoot: config.modRequest.platformProjectRoot,
    });
    return config;
  });
  return config;
}

module.exports = createRunOncePlugin(withShareExtension, 'unmute-share-extension', '1.0.0');
