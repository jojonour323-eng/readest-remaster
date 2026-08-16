'use client';

import { useReaderStore } from '@/stores/reader-store';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Sun, Moon, Star, Coffee, BookOpen, ScrollText } from 'lucide-react';
import type { ThemeName } from '@/lib/types';

export function SettingsPanel() {
  const settings = useReaderStore((s) => s.settings);
  const setSetting = useReaderStore((s) => s.setSetting);

  return (
    <div className="p-4 space-y-6">
      {/* Theme */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Theme</Label>
        <ToggleGroup
          type="single"
          value={settings.theme}
          onValueChange={(v) => v && setSetting('theme', v as ThemeName)}
          className="grid grid-cols-4 gap-2 mt-2"
        >
          <ToggleGroupItem value="light" aria-label="Light theme" className="flex flex-col gap-1 h-auto py-2">
            <Sun className="w-4 h-4" />
            <span className="text-[10px]">Light</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="sepia" aria-label="Sepia theme" className="flex flex-col gap-1 h-auto py-2">
            <Coffee className="w-4 h-4" />
            <span className="text-[10px]">Sepia</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Dark theme" className="flex flex-col gap-1 h-auto py-2">
            <Moon className="w-4 h-4" />
            <span className="text-[10px]">Dark</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="ambient" aria-label="Ambient theme" className="flex flex-col gap-1 h-auto py-2">
            <Star className="w-4 h-4" />
            <span className="text-[10px]">Ambient</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Page mode */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reading mode</Label>
        <ToggleGroup
          type="single"
          value={settings.pageMode}
          onValueChange={(v) => v && setSetting('pageMode', v as 'scroll' | 'paginated')}
          className="grid grid-cols-2 gap-2 mt-2"
        >
          <ToggleGroupItem value="paginated" aria-label="Paginated mode" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Paginated
          </ToggleGroupItem>
          <ToggleGroupItem value="scroll" aria-label="Scroll mode" className="flex items-center gap-2">
            <ScrollText className="w-4 h-4" /> Scroll
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Two-page (spread) view — only available in paginated mode */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="spread-view">Two-page view</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show two pages side by side, like an open book.
          </p>
        </div>
        <Switch
          id="spread-view"
          checked={settings.spreadView}
          onCheckedChange={(v) => setSetting('spreadView', v)}
          disabled={settings.pageMode !== 'paginated'}
          aria-label="Toggle two-page spread view"
        />
      </div>

      {/* Font family */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Font</Label>
        <Select
          value={settings.fontFamily}
          onValueChange={(v) => setSetting('fontFamily', v)}
        >
          <SelectTrigger className="mt-1.5" aria-label="Font family">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="serif">Serif (Georgia)</SelectItem>
            <SelectItem value="sans">Sans-serif</SelectItem>
            <SelectItem value="mono">Monospace</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Font size */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Font size</Label>
          <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
        </div>
        <Slider
          className="mt-2"
          min={12}
          max={32}
          step={1}
          value={[settings.fontSize]}
          onValueChange={(v) => setSetting('fontSize', v[0])}
          aria-label="Font size"
        />
      </div>

      {/* Line height */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Line spacing</Label>
          <span className="text-xs text-muted-foreground">{settings.lineHeight.toFixed(2)}</span>
        </div>
        <Slider
          className="mt-2"
          min={1.0}
          max={2.2}
          step={0.05}
          value={[settings.lineHeight]}
          onValueChange={(v) => setSetting('lineHeight', v[0])}
          aria-label="Line spacing"
        />
      </div>

      {/* Letter spacing */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Letter spacing</Label>
          <span className="text-xs text-muted-foreground">{settings.letterSpacing.toFixed(1)}px</span>
        </div>
        <Slider
          className="mt-2"
          min={-0.5}
          max={2}
          step={0.1}
          value={[settings.letterSpacing]}
          onValueChange={(v) => setSetting('letterSpacing', v[0])}
          aria-label="Letter spacing"
        />
      </div>

      {/* Margin */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Margin</Label>
          <span className="text-xs text-muted-foreground">{settings.margin}%</span>
        </div>
        <Slider
          className="mt-2"
          min={0}
          max={25}
          step={1}
          value={[settings.margin]}
          onValueChange={(v) => setSetting('margin', v[0])}
          aria-label="Margin"
        />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="justify-text">Justify text</Label>
          <Switch
            id="justify-text"
            checked={settings.justifyText}
            onCheckedChange={(v) => setSetting('justifyText', v)}
            aria-label="Toggle justified text"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="hyphenate">Auto-hyphenate</Label>
          <Switch
            id="hyphenate"
            checked={settings.hyphenate}
            onCheckedChange={(v) => setSetting('hyphenate', v)}
            aria-label="Toggle auto-hyphenation"
          />
        </div>
      </div>

      {/* Speed Reading section */}
      <div className="border-t pt-4 space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Speed Reading</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Choose a speed-reading mode. A launch button appears in the reader when enabled.
          </p>
          <ToggleGroup
            type="single"
            value={settings.speedReadingMode}
            onValueChange={(v) => v && setSetting('speedReadingMode', v as 'off' | 'rsvp' | 'guide')}
            className="grid grid-cols-3 gap-2"
          >
            <ToggleGroupItem value="off" aria-label="Off">
              Off
            </ToggleGroupItem>
            <ToggleGroupItem value="rsvp" aria-label="RSVP mode">
              RSVP
            </ToggleGroupItem>
            <ToggleGroupItem value="guide" aria-label="Reading Guide mode">
              Reading Guide
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {settings.speedReadingMode !== 'off' && (
          <div>
            <div className="flex justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Words per minute</Label>
              <span className="text-xs text-muted-foreground">{settings.speedReadingWpm} WPM</span>
            </div>
            <Slider
              className="mt-2"
              min={100}
              max={700}
              step={25}
              value={[settings.speedReadingWpm]}
              onValueChange={(v) => setSetting('speedReadingWpm', v[0])}
              aria-label="Words per minute"
            />
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>100</span>
              <span>300</span>
              <span>700</span>
            </div>
          </div>
        )}

        {settings.speedReadingMode === 'guide' && (
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="guide-centered">Keep guide centered</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Scroll the page to keep the active line near the middle.
              </p>
            </div>
            <Switch
              id="guide-centered"
              checked={settings.guideCentered}
              onCheckedChange={(v) => setSetting('guideCentered', v)}
              aria-label="Toggle keep guide centered"
            />
          </div>
        )}
      </div>

      <div className="border-t pt-3 text-xs text-muted-foreground">
        Keyboard shortcuts: <kbd className="font-mono">←</kbd>/<kbd className="font-mono">→</kbd> to flip pages. Select any text for Simplify, Highlight, Translate.
      </div>
    </div>
  );
}
