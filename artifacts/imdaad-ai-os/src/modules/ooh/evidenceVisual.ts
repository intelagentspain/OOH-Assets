import type { OOHEvidenceItem, OOHAsset } from './types';

const realEvidencePhotos = {
  billboard: '/ooh/evidence/street-furniture.jpg',
  digital: '/ooh/evidence/digital-screen.jpg',
  streetFurniture: '/ooh/evidence/billboard-wide.jpg',
} as const;

function formatKey(asset?: OOHAsset): keyof typeof realEvidencePhotos {
  const format = asset?.format.toLowerCase() ?? '';
  const name = asset?.name.toLowerCase() ?? '';

  if (format.includes('digital') || format.includes('screen') || name.includes('digital')) return 'digital';
  if (format.includes('shelter') || format.includes('furniture') || format.includes('totem')) return 'streetFurniture';
  return 'billboard';
}

export function evidencePhotoSrc(item: OOHEvidenceItem, asset?: OOHAsset): string {
  return item.url || realEvidencePhotos[formatKey(asset)];
}

export function assetPreviewPhotoSrc(asset?: OOHAsset): string {
  return realEvidencePhotos[formatKey(asset)];
}

export function evidencePhotoObjectPosition(asset?: OOHAsset): string {
  const key = formatKey(asset);
  if (key === 'billboard') return 'center 58%';
  if (key === 'streetFurniture') return 'center 52%';
  return 'center center';
}

export function evidencePhotoAlt(item: OOHEvidenceItem, asset?: OOHAsset): string {
  const category = item.photoCategory ? `${item.photoCategory.toLowerCase()} ` : '';
  return `Real ${category}photo evidence for ${asset?.name ?? item.label}`;
}

export function assetPreviewPhotoAlt(asset?: OOHAsset): string {
  return `Real OOH asset preview for ${asset?.name ?? 'selected asset'}`;
}
