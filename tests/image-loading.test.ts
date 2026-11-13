import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Image Library & Metadata Verification', () => {
  const manifestPath = path.resolve('public/assets/images/manifest.json');

  test('manifest.json exists and contains acquired stock photos', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(Array.isArray(data.assets)).toBe(true);
    expect(data.assets.length).toBeGreaterThanOrEqual(20);
  });

  test('each asset in manifest has valid license, photographer, source_url and local file', () => {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const asset of data.assets.slice(0, 20)) {
      expect(asset.asset_id).toMatch(/^img_\d{3}$/);
      expect(asset.photographer).toBeTruthy();
      expect(asset.license).toBeTruthy();
      expect(asset.local_path).toBeTruthy();
      expect(asset.width).toBeGreaterThanOrEqual(600);
      expect(asset.height).toBeGreaterThanOrEqual(600);

      // Verify that local file exists on disk
      const localFilePath = path.resolve('public', asset.local_path);
      expect(fs.existsSync(localFilePath)).toBe(true);
      const stat = fs.statSync(localFilePath);
      expect(stat.size).toBeGreaterThan(1000); // real non-empty image file
    }
  });

  test('no fake or invented URLs marked as authorized without metadata', () => {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const asset of data.assets) {
      expect(asset.stock_photo).toBe(true);
      expect(asset.source_url).toMatch(/^https?:\/\//);
    }
  });
});
