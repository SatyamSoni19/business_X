import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, ScanLine, Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CameraCapture from './CameraCapture';
import { scanFiles } from '../../ocr/runOcr';
import { checkOcrAssets } from '../../ocr/ocrWorker';
import { parseBillLines } from '../../parser/billParser';
import { SAMPLE_BILL_LINES } from '../../parser/sampleBill';
import { newId } from '../../lib/id';
import { useImportStore } from './useImportStore';

const ACCEPT = 'image/*,application/pdf';

export default function BillUpload() {
    const { stage, progress, error, startProcessing, setProgress, loadRows, fail } = useImportStore();
    const [files, setFiles] = useState([]); // [{ id, file, url }]
    const [cameraOpen, setCameraOpen] = useState(false);
    const [adaptive, setAdaptive] = useState(false);
    const [ocrReady, setOcrReady] = useState(null);
    const [dragging, setDragging] = useState(false);
    const pickRef = useRef(null);
    const nativeCamRef = useRef(null);
    const filesRef = useRef(files);
    filesRef.current = files;

    useEffect(() => {
        checkOcrAssets().then(setOcrReady);
        return () => filesRef.current.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    }, []);

    const busy = stage === 'processing';

    function addFiles(list) {
        const ok = Array.from(list).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
        setFiles((prev) => [
            ...prev,
            ...ok.map((file) => ({ id: newId(), file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })),
        ]);
    }

    function removeFile(id) {
        setFiles((prev) => {
            const f = prev.find((x) => x.id === id);
            if (f?.url) URL.revokeObjectURL(f.url);
            return prev.filter((x) => x.id !== id);
        });
    }

    async function readBill() {
        startProcessing();
        try {
            const lines = await scanFiles(
                files.map((f) => f.file),
                { adaptive, onProgress: setProgress }
            );
            const { rows, skipped } = parseBillLines(lines);
            if (!rows.length) {
                fail('No item lines were found. Try a sharper, well-lit photo, or turn on the shadow option below.');
                return;
            }
            loadRows(rows, skipped, `${files.length} file${files.length > 1 ? 's' : ''}`);
            files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
            setFiles([]);
        } catch (e) {
            const msg = String(e?.message || e);
            fail(
                /fetch|network|load/i.test(msg)
                    ? 'Offline OCR files could not be loaded. Run "npm run ocr:assets" and restart the dev server.'
                    : `Could not read this bill: ${msg}`
            );
        }
    }

    function useSample() {
        const { rows, skipped } = parseBillLines(SAMPLE_BILL_LINES);
        loadRows(rows, skipped, 'Sample bill');
    }

    return (
        <div className="space-y-4">
            {ocrReady === false && (
                <div className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    Offline OCR files not found in <code>public/tesseract</code>. Run <code>npm run ocr:assets</code> and restart{' '}
                    <code>npm run dev</code>.
                </div>
            )}

            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!busy) addFiles(e.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors md:p-10 ${dragging ? 'border-slate-900 bg-slate-100' : 'border-slate-500 bg-white'
                    }`}
            >
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl border-2 border-slate-900 bg-slate-900 text-white">
                    <ScanLine size={28} />
                </div>
                <h3 className="text-xl font-extrabold">Scan your purchase bill</h3>
                <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-600">
                    Take a photo, upload images, or drop a PDF. Items are read on this device (works offline), then you check them
                    before saving.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Button icon={Camera} size="lg" disabled={busy} onClick={() => setCameraOpen(true)}>
                        Open camera
                    </Button>
                    <Button icon={Upload} size="lg" variant="secondary" disabled={busy} onClick={() => pickRef.current?.click()}>
                        Choose files
                    </Button>
                    <Button size="lg" variant="secondary" disabled={busy} onClick={() => nativeCamRef.current?.click()}>
                        Phone camera app
                    </Button>
                </div>

                <input
                    ref={pickRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    hidden
                    onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
                <input
                    ref={nativeCamRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = '';
                    }}
                />
            </div>

            {files.length > 0 && (
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-bold">
                            {files.length} page{files.length > 1 ? 's' : ''} ready
                        </h4>
                        <Badge tone="info">Order = order of reading</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {files.map((f, i) => (
                            <div key={f.id} className="relative h-28 w-24 overflow-hidden rounded-lg border-2 border-slate-900 bg-slate-100">
                                {f.url ? (
                                    <img src={f.url} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="grid h-full place-items-center text-slate-700">
                                        <FileText size={30} />
                                    </div>
                                )}
                                <span className="absolute bottom-0 left-0 rounded-tr-md bg-slate-900 px-1.5 text-xs font-bold text-white">
                                    {i + 1}
                                </span>
                                {!busy && (
                                    <button
                                        onClick={() => removeFile(f.id)}
                                        aria-label="Remove page"
                                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md border-2 border-slate-900 bg-white hover:bg-red-50"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold">
                        <input
                            type="checkbox"
                            checked={adaptive}
                            onChange={(e) => setAdaptive(e.target.checked)}
                            disabled={busy}
                            className="h-4 w-4 accent-slate-900"
                        />
                        Photo has shadows or uneven light (stronger clean-up, a bit slower)
                    </label>

                    <div className="mt-4">
                        <Button size="lg" icon={ScanLine} disabled={busy} onClick={readBill}>
                            {busy ? 'Reading…' : 'Read bill'}
                        </Button>
                    </div>
                </div>
            )}

            {busy && (
                <div className="rounded-xl border-2 border-slate-900 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between text-sm font-bold">
                        <span>{progress.message || 'Working…'}</span>
                        <span>{progress.pct}%</span>
                    </div>
                    <div className="h-4 overflow-hidden rounded-full border-2 border-slate-900 bg-slate-100">
                        <div className="h-full bg-slate-900 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                        The first scan loads the OCR engine and can take a few seconds. Later scans are faster.
                    </p>
                </div>
            )}

            {error && (
                <div className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>
            )}

            <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="font-medium">Just want to see the review screen?</span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={useSample}>
                    Try a sample bill
                </Button>
            </div>

            <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(file) => addFiles([file])} />
        </div>
    );
}