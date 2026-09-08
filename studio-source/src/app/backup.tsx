import { useRef, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { hasSavedStudio, importStudio, downloadBackup } from '@/lib/storage';
import { validateState } from '@/lib/validate';
export function ImportPlan() {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  const apply = async (raw: string) => {
    setBusy(true);
    try {
      await importStudio(raw);
      setPending(null);
      setError('');
      setSuccess(true);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Select a private plan or backup"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (!selected) return;
          setSuccess(false);
          setError('');
          try {
            if (selected.size > 8_000_000)
              throw new Error('Choose a JSON export smaller than 8 MB.');
            const text = await selected.text();
            validateState(JSON.parse(text));
            if (hasSavedStudio()) setPending(text);
            else await apply(text);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : 'This file could not be imported.',
            );
          }
        }}
      />
      <Button
        variant="outline"
        onClick={() => file.current?.click()}
        disabled={busy}
      >
        <Upload size={14} />{' '}
        {success ? 'Plan imported' : 'Import plan or backup'}
      </Button>
      {error && (
        <p role="alert" className="small amber mt-3">
          {error}
        </p>
      )}
      <Dialog
        open={pending !== null}
        onOpenChange={(v) => !v && setPending(null)}
      >
        <DialogContent>
          <DialogTitle>Replace this browser’s records?</DialogTitle>
          <DialogDescription>
            The selected file will replace the current plan, diary and activity
            records on this device. Download a backup first if you want to keep
            them.
          </DialogDescription>
          <div className="row wrap">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  downloadBackup();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Backup failed.');
                }
              }}
            >
              <Download /> Back up current data
            </Button>
            <Button
              disabled={busy}
              onClick={() => pending && void apply(pending)}
            >
              Replace with selected file
            </Button>
          </div>
          {error && (
            <p role="alert" className="small amber">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
