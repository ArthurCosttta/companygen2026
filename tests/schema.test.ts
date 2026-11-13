import { test, expect } from '@playwright/test';
import { validateSpec } from '../src/compiler/validate-spec';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Schema & Spec Validation', () => {
  test('validates campaign-fashion.json successfully with 11 posts matching reference UI', () => {
    const raw = fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8');
    const result = validateSpec(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.spec.schema_version).toBe('1.0.0');
    expect(result.spec.brand.id).toBe('fashion-template');
    expect(result.spec.posts.length).toBe(11);
    expect(result.spec.posts[0].slides.length).toBe(5);
    expect(result.spec.posts[1].slides.length).toBe(3);
  });

  test('validates campaign-electronics.json successfully', () => {
    const raw = fs.readFileSync(path.resolve('examples/campaign-electronics.json'), 'utf8');
    const result = validateSpec(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.spec.brand.name).toBe('Volt Eletrônicos');
    expect(result.spec.posts.length).toBe(4);
  });

  test('reports exact path when a slide has an invalid template', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
    raw.posts[0].slides[3].template = 'template_invalido_xyz';

    const result = validateSpec(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.errors.find((e) => e.path.includes('posts[0].slides[3].template'));
    expect(error).toBeDefined();
    expect(error?.message).toContain('Template não registrado');
  });

  test('rejects duplicate post IDs with exact path', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
    raw.posts[1].id = raw.posts[0].id; // Duplicate

    const result = validateSpec(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.errors.find((e) => e.path.includes('posts[1].id'));
    expect(error).toBeDefined();
    expect(error?.message).toContain('ID de post duplicado');
  });

  test('enforces limits: rejects more than 30 posts', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
    const basePost = raw.posts[0];
    const manyPosts = [];
    for (let i = 0; i < 35; i++) {
      manyPosts.push({ ...basePost, id: `post_${i}` });
    }
    raw.posts = manyPosts;

    const result = validateSpec(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.errors.find((e) => e.path === 'posts');
    expect(error).toBeDefined();
    expect(error?.message).toContain('Máximo de 30 posts');
  });

  test('enforces limits: rejects more than 10 slides per post', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
    const baseSlide = raw.posts[0].slides[0];
    const manySlides = [];
    for (let i = 0; i < 12; i++) {
      manySlides.push({ ...baseSlide, id: `slide_${i}` });
    }
    raw.posts[0].slides = manySlides;

    const result = validateSpec(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.errors.find((e) => e.path === 'posts[0].slides');
    expect(error).toBeDefined();
    expect(error?.message).toContain('Máximo de 10 slides');
  });

  test('warns or rejects unknown keys according to schema policy', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
    (raw as any).unknown_root_property = 'test';

    // Default policy: warn
    const resultWarn = validateSpec(raw);
    expect(resultWarn.ok).toBe(true);
    expect(resultWarn.warnings.some((w) => w.path === 'unknown_root_property')).toBe(true);

    // Strict policy: error
    raw.schema_policy = { unknown_fields: 'error' };
    const resultError = validateSpec(raw);
    expect(resultError.ok).toBe(false);
  });
});
