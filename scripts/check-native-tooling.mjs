import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve("@capacitor/cli/package.json"));
const xcode = cliRequire("xcode");
const { addSwiftFileToAppTarget } = cliRequire("./dist/util/xcode.js");

// The scoped xcode 4 override removes uuid without downgrading Capacitor.
// Exercise the CLI's actual integration, not just its --version command.
test("Capacitor can edit an iOS project with the patched Xcode parser", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "after-xcode-compat-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url);
  const source = await readFile(original, "utf8");
  const file = join(directory, "project.pbxproj");
  await copyFile(original, file);
  const before = xcode.project(file);
  before.parseSync();
  const target = before.getFirstTarget().uuid;
  const configs = before.pbxXCBuildConfigurationSection();
  const packages = before.hash.project.objects.XCLocalSwiftPackageReference;
  const products = before.hash.project.objects.XCSwiftPackageProductDependency;
  assert.ok(packages && products, "fixture has real Swift package references");
  const ids = new Set(Array.from({ length: 1000 }, () => before.generateUuid()));
  assert.equal(ids.size, 1000);
  assert.ok([...ids].every((id) => /^[A-F0-9]{24}$/.test(id)));

  assert.deepEqual(addSwiftFileToAppTarget(file, "App", "AfterToolingProbe.swift"), {
    added: true,
  });
  const firstWrite = await readFile(file, "utf8");
  assert.deepEqual(addSwiftFileToAppTarget(file, "App", "AfterToolingProbe.swift"), {
    added: false,
  });
  assert.equal(await readFile(file, "utf8"), firstWrite, "registration stays idempotent");
  const after = xcode.project(file);
  after.parseSync();
  assert.ok(after.hasFile("AfterToolingProbe.swift"));
  assert.equal(after.getFirstTarget().uuid, target);
  assert.deepEqual(after.pbxXCBuildConfigurationSection(), configs);
  assert.deepEqual(after.hash.project.objects.XCLocalSwiftPackageReference, packages);
  assert.deepEqual(after.hash.project.objects.XCSwiftPackageProductDependency, products);
  assert.ok(
    Object.values(after.pbxSourcesBuildPhaseObj(target).files).some((entry) =>
      entry.comment?.includes("AfterToolingProbe.swift"),
    ),
    "the source is linked to the app target, not just registered as a file",
  );
  assert.equal(await readFile(original, "utf8"), source, "the real iOS project is untouched");
});
