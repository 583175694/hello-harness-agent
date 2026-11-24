import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { postprocessPptxBuffer, postprocessSlideXml } from '../src/export/postprocess-pptx.js';

function wrapSlide(shapesXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    `<p:cSld><p:spTree>${shapesXml}</p:spTree></p:cSld></p:sld>`
  );
}

describe('postprocessSlideXml', () => {
  it('replaces spAutoFit with noAutofit and adds height headroom for multiline body boxes', () => {
    const xml = wrapSlide(
      '<p:sp>' +
        '<p:spPr><a:xfrm><a:off x="647700" y="1990725"/><a:ext cx="3250882" cy="660082"/></a:xfrm><a:ln><a:noFill/></a:ln></p:spPr>' +
        '<p:txBody>' +
        '<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:spAutoFit/></a:bodyPr>' +
        '<a:p><a:pPr algn="l"><a:lnSpc><a:spcPts val="1732"/></a:lnSpc></a:pPr>' +
        '<a:r><a:rPr sz="1050"><a:latin typeface="Noto Sans CJK SC"/><a:ea typeface="Noto Sans CJK SC"/></a:rPr>' +
        '<a:t>多行正文内容</a:t></a:r></a:p>' +
        '</p:txBody>' +
        '</p:sp>',
    );

    const out = postprocessSlideXml(xml);

    expect(out).not.toContain('<a:spAutoFit/>');
    expect(out).toContain('<a:noAutofit/>');
    // 3250882 * 1.05 = 3413426, 660082 * 1.12 = 739292
    expect(out).toContain('cx="3413426"');
    expect(out).toContain('cy="739292"');
    // 1732 * 0.9 = 1559
    expect(out).toContain('<a:spcPts val="1559"/>');
    // Font family mapped to Microsoft YaHei
    expect(out).toContain('typeface="Microsoft YaHei"');
    expect(out).not.toContain('typeface="Noto Sans CJK SC"');
  });

  it('expands right-aligned single-line boxes leftward while preserving right edge', () => {
    const x = 10_744_200;
    const cx = 990_600;
    const rightEdge = x + cx;
    const xml = wrapSlide(
      '<p:sp>' +
        `<p:spPr><a:xfrm><a:off x="${x}" y="895350"/><a:ext cx="${cx}" cy="171450"/></a:xfrm></p:spPr>` +
        '<p:txBody>' +
        '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:spAutoFit/></a:bodyPr>' +
        '<a:p><a:pPr algn="r"/><a:r><a:rPr sz="975"/><a:t>为什么走势这么差</a:t></a:r></a:p>' +
        '</p:txBody>' +
        '</p:sp>',
    );

    const out = postprocessSlideXml(xml);
    const match = /<a:off x="(\d+)" y="895350"\/>\s*<a:ext cx="(\d+)" cy="171450"\/>/u.exec(out);
    expect(match).not.toBeNull();
    const newX = Number(match![1]);
    const newCx = Number(match![2]);
    expect(newCx).toBeGreaterThan(cx);
    expect(newX).toBeLessThan(x);
    expect(newX + newCx).toBe(rightEdge);
  });

  it('expands bordered single-line badge gently and symmetrically when centered', () => {
    const x = 1_000_000;
    const cx = 1_750_000;
    const xml = wrapSlide(
      '<p:sp>' +
        `<p:spPr><a:xfrm><a:off x="${x}" y="457200"/><a:ext cx="${cx}" cy="304800"/></a:xfrm><a:ln w="9525"/></p:spPr>` +
        '<p:txBody>' +
        '<a:bodyPr wrap="none" lIns="133347" tIns="57149" rIns="133347" bIns="57149" anchor="t"><a:spAutoFit/></a:bodyPr>' +
        '<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="975"/><a:t>12 页 · 指数 / 板块 / 个股</a:t></a:r></a:p>' +
        '</p:txBody>' +
        '</p:sp>',
    );

    const out = postprocessSlideXml(xml);
    const match = /<a:off x="(\d+)" y="457200"\/>\s*<a:ext cx="(\d+)" cy="304800"\/>/u.exec(out);
    expect(match).not.toBeNull();
    const newX = Number(match![1]);
    const newCx = Number(match![2]);
    // 8% of 1_750_000 = 140_000
    expect(newCx).toBe(cx + 140_000);
    expect(newX).toBe(x - 70_000);
  });

  it('leaves non-text decorative shapes untouched', () => {
    const xml = wrapSlide(
      '<p:sp>' +
        '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>' +
        '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr>' +
        '</p:sp>',
    );
    expect(postprocessSlideXml(xml)).toBe(xml);
  });

  it('clamps horizontal text expansion inside the tightest enclosing card container', () => {
    const cardX = 6_000_000;
    const cardCx = 5_000_000;
    const cardRight = cardX + cardCx;
    // Left padding 190_500 (20px), right padding 190_500 (20px) -> 5% of 4_619_000 = 230_950 (> 190_500)
    const textX = cardX + 190_500;
    const textCx = cardCx - 381_000;
    const xml = wrapSlide(
      '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>' +
        '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr></p:sp>' +
        '<p:sp><p:spPr>' +
        `<a:xfrm><a:off x="${cardX}" y="1000000"/><a:ext cx="${cardCx}" cy="2000000"/></a:xfrm>` +
        '<a:solidFill><a:srgbClr val="F5F7FA"/></a:solidFill></p:spPr></p:sp>' +
        '<p:sp><p:spPr>' +
        `<a:xfrm><a:off x="${textX}" y="1200000"/><a:ext cx="${textCx}" cy="800000"/></a:xfrm>` +
        '<a:ln><a:noFill/></a:ln></p:spPr>' +
        '<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr>' +
        '<a:p><a:r><a:rPr sz="1050"/><a:t>卡片内多行正文</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:sp><p:spPr>' +
        `<a:xfrm><a:off x="${textX}" y="1050000"/><a:ext cx="${textCx - 100_000}" cy="180000"/></a:xfrm>` +
        '</p:spPr><p:txBody><a:bodyPr wrap="none"><a:spAutoFit/></a:bodyPr>' +
        '<a:p><a:pPr algn="l"/><a:r><a:rPr sz="1050"/><a:t>卡片内长单行标题</a:t></a:r></a:p></p:txBody></p:sp>',
    );

    const out = postprocessSlideXml(xml);
    const matches = [...out.matchAll(/<a:off x="(\d+)" y="(1200000|1050000)"\/>\s*<a:ext cx="(\d+)" cy="\d+"\/>/gu)];
    expect(matches).toHaveLength(2);
    for (const m of matches) {
      const outX = Number(m[1]);
      const outCx = Number(m[3]);
      // Must stay strictly inside cardRight - 57_150 (6px inset)
      expect(outX + outCx).toBeLessThanOrEqual(cardRight - 57_150);
      expect(outX).toBeGreaterThanOrEqual(cardX);
    }
  });
});

describe('postprocessPptxBuffer', () => {
  it('passes through non-zip buffers safely', async () => {
    const raw = Buffer.from('pptx');
    const out = await postprocessPptxBuffer(raw);
    expect(out).toBe(raw);
  });

  it('rewrites slide XML inside a valid PPTX archive', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      wrapSlide(
        '<p:sp>' +
          '<p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="1000000" cy="400000"/></a:xfrm></p:spPr>' +
          '<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr>' +
          '<a:p><a:r><a:rPr sz="1050"><a:ea typeface="Noto Sans CJK SC"/></a:rPr><a:t>测试</a:t></a:r></a:p>' +
          '</p:txBody></p:sp>',
      ),
    );
    const input = await zip.generateAsync({ type: 'nodebuffer' });

    const output = await postprocessPptxBuffer(input);
    const reloaded = await JSZip.loadAsync(output);
    const slide1 = await reloaded.file('ppt/slides/slide1.xml')!.async('string');

    expect(slide1).toContain('<a:noAutofit/>');
    expect(slide1).toContain('typeface="Microsoft YaHei"');
  });
});
