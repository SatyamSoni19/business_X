import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopStream = (s) => s?.getTracks().forEach((t) => t.stop());

function describe(err) {
    switch (err?.name) {
        case 'InsecureContext':
            return 'The browser blocks the camera on this address. Open the app at http://localhost:5173 (or an https:// address). A plain http://192.168.x.x link will not work.';
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera permission is blocked. Click the camera/lock icon in the address bar, set Camera to Allow, then press Try again. On Windows also check Settings → Privacy & security → Camera.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No usable camera was found on this device.';
        case 'NotReadableError':
        case 'AbortError':
            return 'The camera is busy or cannot be opened. Close other apps or tabs using it (Zoom, Teams, Meet, another browser tab), then press Try again.';
        default:
            return 'Could not start the camera.';
    }
}

// Tries a few settings, from best quality to most compatible, until one works.
async function openStream(deviceId) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const e = new Error('Insecure context');
        e.name = 'InsecureContext';
        throw e;
    }

    const attempts = deviceId
        ? [{ video: { deviceId: { exact: deviceId } } }, { video: true }]
        : [
            { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
            { video: { facingMode: { ideal: 'environment' } } },
            { video: true },
        ];

    let lastErr;
    for (const constraints of attempts) {
        try {
            return await navigator.mediaDevices.getUserMedia({ ...constraints, audio: false });
        } catch (e) {
            lastErr = e;
            // permission problems will not be fixed by other settings
            if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
            // camera busy: give it a moment, then try the next option
            if (e.name === 'NotReadableError' || e.name === 'AbortError') await sleep(500);
        }
    }
    throw lastErr;
}

export default function CameraCapture({ open, onClose, onCapture }) {
    const videoRef = useRef(null);
    const fileRef = useRef(null);

    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null); // { message, code }
    const [shots, setShots] = useState(0);
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState(''); // what we ask for
    const [activeId, setActiveId] = useState(''); // what is actually running
    const [attempt, setAttempt] = useState(0); // bump to retry

    // reset when the dialog opens
    useEffect(() => {
        if (open) {
            setShots(0);
            setDeviceId('');
            setActiveId('');
            setDevices([]);
            setAttempt(0);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        let stream = null;
        setReady(false);
        setError(null);

        // Small delay: React StrictMode (dev) runs effects twice. The first run is cancelled
        // before it ever touches the camera, so Windows never sees two quick open/close cycles.
        const timer = setTimeout(async () => {
            try {
                stream = await openStream(deviceId);
                if (cancelled) {
                    stopStream(stream);
                    return;
                }
                const video = videoRef.current;
                if (!video) {
                    stopStream(stream);
                    return;
                }
                video.srcObject = stream;

                const track = stream.getVideoTracks()[0];
                setActiveId(track?.getSettings?.().deviceId || '');

                // device labels are only available after permission is granted
                const all = await navigator.mediaDevices.enumerateDevices();
                if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'));
            } catch (e) {
                console.error('Camera error:', e);
                if (!cancelled) setError({ message: describe(e), code: e?.name || 'Error' });
            }
        }, 150);

        // always release the camera when closing, switching or retrying
        return () => {
            cancelled = true;
            clearTimeout(timer);
            stopStream(stream);
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [open, deviceId, attempt]);

    function snap() {
        const v = videoRef.current;
        if (!v || !v.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        c.toBlob(
            (blob) => {
                if (!blob) return;
                onCapture(new File([blob], `bill-${Date.now()}.jpg`, { type: 'image/jpeg' }));
                setShots((n) => n + 1);
            },
            'image/jpeg',
            0.95
        );
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Scan bill with camera"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        {shots ? `Done (${shots} captured)` : 'Cancel'}
                    </Button>
                    <Button icon={Camera} onClick={snap} disabled={!ready}>
                        Capture page
                    </Button>
                </>
            }
        >
            <div className="relative overflow-hidden rounded-lg border-2 border-slate-900 bg-black">
                {/* the video is always mounted so its ref is always available */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => videoRef.current?.play().catch(() => { })}
                    onPlaying={() => setReady(true)}
                    className="aspect-video w-full object-contain"
                />

                {!error && (
                    <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-dashed border-white/80" />
                )}

                {!ready && !error && (
                    <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">Starting camera…</div>
                )}

                {error && (
                    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-white p-5">
                        <div className="max-w-md text-center">
                            <p className="text-sm font-bold text-red-800">{error.message}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Technical code: {error.code}</p>
                            <div className="mt-4 flex flex-wrap justify-center gap-3">
                                <Button size="sm" icon={RefreshCw} onClick={() => setAttempt((n) => n + 1)}>
                                    Try again
                                </Button>
                                <Button size="sm" variant="secondary" icon={ImagePlus} onClick={() => fileRef.current?.click()}>
                                    Use phone camera / pick photo
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {devices.length > 1 && (
                <div className="mt-3 flex items-center gap-3">
                    <span className="text-sm font-bold">Camera</span>
                    <select
                        value={activeId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-md border-2 border-slate-900 bg-white px-2 text-sm font-semibold"
                    >
                        {devices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                                {d.label || `Camera ${i + 1}`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <p className="mt-3 text-sm font-medium text-slate-600">
                Hold the bill flat and upright, fill the frame, and avoid shadows. Long bill? Capture it page by page and keep this
                window open to add more.
            </p>

            {/* fallback: opens the phone's camera app (mobile) or the file picker (desktop) */}
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        onCapture(file);
                        setShots((n) => n + 1);
                    }
                    e.target.value = '';
                }}
            />
        </Modal>
    );
}