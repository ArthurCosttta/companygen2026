import { test, expect } from '@playwright/test';
import { PostCompositionEngine } from '../src/compiler/build-post-ir';
import { approximateMeasurer } from '../src/compiler/layout-engine';
import { validateSpec } from '../src/compiler/validate-spec';
import fs from 'node:fs';
import path from 'node:path';

test.describe('Composition Engine & IR Compiler', () => {
  const rawFashion = JSON.parse(fs.readFileSync(path.resolve('examples/campaign-fashion.json'), 'utf8'));
  const valid = validateSpec(rawFashion);
  if (!valid.ok) throw new Error('Invalid spec');
  const spec = valid.spec;

  const engine = new PostCompositionEngine(approximateMeasurer);

  test('compiles 5 slides into 5 distinct PostSceneIR with 1080x1350 logical dimensions', () => {
    const post = spec.posts[0];
    const scenes = engine.compilePost({
      brand: spec.brand,
      campaign: spec.campaign,
      post,
      products: spec.products,
      assets: [],
    });

    expect(scenes.length).toBe(5);
    scenes.forEach((scene, idx) => {
      expect(scene.width).toBe(1080);
      expect(scene.height).toBe(1350);
      expect(scene.metadata.slide_index).toBe(idx);
      expect(scene.metadata.template).toBe(post.slides[idx].template);
      expect(scene.metadata.hash).toBeTruthy();
    });
  });

  test('different templates produce different layer structures', () => {
    const post = spec.posts[0];
    const scenes = engine.compilePost({
      brand: spec.brand,
      campaign: spec.campaign,
      post,
      products: spec.products,
      assets: [],
    });

    const coverScene = scenes[0]; // cover
    const productScene = scenes[1]; // product_focus
    const splitScene = scenes[2]; // editorial_split
    const ctaScene = scenes[4]; // cta

    expect(coverScene.metadata.template).toBe('cover');
    expect(productScene.metadata.template).toBe('product_focus');
    expect(splitScene.metadata.template).toBe('editorial_split');
    expect(ctaScene.metadata.template).toBe('cta');

    // Each template has its own unique layer hierarchy
    expect(coverScene.shape_layers.length).toBeGreaterThan(0);
    expect(ctaScene.text_layers.some((l) => l.id.includes('cta')) || ctaScene.shape_layers.some((l) => l.id.includes('cta'))).toBe(true);
  });

  test('editing headline updates the compiled text layer immediately', () => {
    const post = { ...spec.posts[0] };
    const modifiedPost = {
      ...post,
      slides: [
        {
          ...post.slides[0],
          headline: 'Título Novo e Totalmente Editado',
        },
        ...post.slides.slice(1),
      ],
    };

    const scenes = engine.compilePost({
      brand: spec.brand,
      campaign: spec.campaign,
      post: modifiedPost,
      products: spec.products,
      assets: [],
    });

    const headlineLayer = scenes[0].text_layers.find((l) => l.id === 'headline');
    expect(headlineLayer).toBeDefined();
    expect(headlineLayer?.text).toBe('Título Novo e Totalmente Editado');
  });

  test('handles long text with line-wrapping without crash', () => {
    const post = { ...spec.posts[0] };
    const longSlide = {
      ...post.slides[0],
      headline: 'Este é um título extremamente longo que ultrapassa uma linha simples e precisa ser quebrado pelo motor de layout para caber no espaço disponível com segurança e elegância',
    };

    const scene = engine.compileSlide(
      {
        brand: spec.brand,
        campaign: spec.campaign,
        post: { ...post, slides: [longSlide] },
        products: spec.products,
        assets: [],
        measurer: approximateMeasurer,
      },
      longSlide,
      0
    );

    const headlineLayer = scene.text_layers.find((l) => l.id === 'headline');
    expect(headlineLayer).toBeDefined();
    expect(headlineLayer?.lines && headlineLayer.lines.length).toBeGreaterThan(1);
  });
});
