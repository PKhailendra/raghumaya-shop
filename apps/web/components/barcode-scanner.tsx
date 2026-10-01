"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, X } from "lucide-react";

/**
 * Phone-camera barcode/QR scanner for the mobile web app.
 * Uses the rear camera; on scan calls onScan with the decoded text.
 */
export function BarcodeScanner({ onScan, buttonLabel = "Scan" }: { onScan: (code: string) => void; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Camera className="h-4 w-4 mr-1" /> {buttonLabel}
      </Button>
      {open && <ScannerDialog onClose={() => setOpen(false)} onScan={(code) => { onScan(code); setOpen(false); }} />}
    </>
  );
}

function ScannerDialog({ onClose, onScan }: { onClose: () => void; onScan: (code: string) => void }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !regionRef.current) return;
        const id = "rms-scanner-region";
        const scanner = new Html5Qrcode(id, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            onScan(decoded);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setStarting(false);
          setError(
            "Camera could not be started. Please allow camera permission and use HTTPS, or type the barcode manually."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      doneRef.current = true;
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Scan barcode
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="py-6 text-center text-sm text-destructive">{error}</div>
        ) : (
          <>
            {starting && <div className="py-6 text-center text-sm text-muted-foreground">Starting camera…</div>}
            <div id="rms-scanner-region" ref={regionRef} className="overflow-hidden rounded-md" />
            <p className="text-center text-xs text-muted-foreground">Point the camera at the product barcode or QR code.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
