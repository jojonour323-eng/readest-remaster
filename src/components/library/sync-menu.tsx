'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { RefreshCw, Download, Upload, Cloud } from 'lucide-react';
import { exportBundle, importBundle, type SyncBundle } from '@/lib/storage';
import { useLibraryStore } from '@/stores/library-store';
import { useReaderStore } from '@/stores/reader-store';
import { toast } from 'sonner';

export function SyncMenu() {
  const [busy, setBusy] = useState(false);
  const load = useLibraryStore((s) => s.load);
  const loadSettings = useReaderStore((s) => s.loadSettings);

  const onExport = async () => {
    setBusy(true);
    try {
      const bundle = await exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `readest-sync-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported sync bundle. Import it on another device to sync progress, notes & bookmarks.');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as SyncBundle;
      await importBundle(bundle);
      await load();
      await loadSettings();
      toast.success('Sync bundle imported');
    } catch (e) {
      console.error(e);
      toast.error('Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} aria-label="Sync menu">
          <Cloud className="w-4 h-4 mr-2" />
          Sync
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Cross-device sync</DropdownMenuLabel>
        <p className="text-xs text-muted-foreground px-2 py-1">
          Export a sync file with all progress, bookmarks, highlights, notes and simplifications, then import it on another device.
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExport}>
          <Download className="w-4 h-4 mr-2" /> Export sync file
        </DropdownMenuItem>
        <label className="flex items-center w-full cursor-pointer relative">
          <Upload className="w-4 h-4 mr-2" />
          <span className="flex-1 text-sm">Import sync file…</span>
          <input
            type="file"
            accept="application/json"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { load(); toast.success('Library refreshed'); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh library
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
