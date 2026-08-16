'use client';

import JSZip from 'jszip';

export interface CbzPage {
  index: number;
  url: string; // object URL or data URL
  name: string;
}

export async function loadCbz(data: ArrayBuffer): Promise<CbzPage[]> {
  const zip = await JSZip.loadAsync(data);
  const files = Object.values(zip.files).filter((f) => !f.dir);
  const imageFiles = files.filter((f) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name));
  imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const pages: CbzPage[] = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const blob = await imageFiles[i].async('blob');
    const url = URL.createObjectURL(blob);
    pages.push({ index: i, url, name: imageFiles[i].name });
  }
  return pages;
}

export function cbzPlainText(_data: ArrayBuffer): string {
  return ''; // comics are images; no text
}
