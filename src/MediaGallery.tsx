import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, ImagePlus, Share2, Trash2, Video, X } from 'lucide-react';

type VisitMedia = {
  id: string;
  homeId: string;
  kind: 'photo' | 'video';
  name: string;
  mimeType: string;
  createdAt: number;
  blob: Blob;
};
type SharePayload = { files: File[]; title: string };
type ShareCapableNavigator = Navigator & {
  canShare?: (data: SharePayload) => boolean;
  share?: (data: SharePayload) => Promise<void>;
};

const DB_NAME = 'homesearch-media-v1';
const STORE_NAME = 'visit-media';

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open device media storage.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Media storage failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Media storage was interrupted.'));
  });
}

async function listVisitMedia(homeId: string): Promise<VisitMedia[]> {
  const db = await openMediaDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<VisitMedia[]>;
    const rows = await new Promise<VisitMedia[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    return rows.filter(item => item.homeId === homeId).sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

async function storeVisitMedia(item: VisitMedia): Promise<void> {
  const db = await openMediaDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(item);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function deleteVisitMedia(id: string): Promise<void> {
  const db = await openMediaDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export default function MediaGallery({ homeId }: { homeId: string }) {
  const [media, setMedia] = useState<VisitMedia[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setMedia(await listVisitMedia(homeId));
  }

  useEffect(() => {
    let current = true;
    setMedia([]);
    setMessage('');
    listVisitMedia(homeId)
      .then(rows => { if (current) setMedia(rows); })
      .catch(() => { if (current) setMessage('Device media storage is unavailable in this browser.'); });
    return () => { current = false; };
  }, [homeId]);

  const mediaUrls = useMemo(
    () => media.map(item => ({ id: item.id, url: URL.createObjectURL(item.blob) })),
    [media],
  );
  useEffect(() => () => mediaUrls.forEach(item => URL.revokeObjectURL(item.url)), [mediaUrls]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage('');
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        if (!isVideo && !file.type.startsWith('image/')) continue;
        const extension = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'media';
        await storeVisitMedia({
          id: crypto.randomUUID(),
          homeId,
          kind: isVideo ? 'video' : 'photo',
          name: file.name || ('home-' + Date.now() + '.' + extension),
          mimeType: file.type,
          createdAt: Date.now(),
          blob: file,
        });
      }
      await refresh();
      setMessage('Saved with this visit on this device.');
    } catch {
      setMessage('This file could not be saved. Your device browser may be out of storage.');
    } finally {
      setBusy(false);
    }
  }

  async function saveToDevice(item: VisitMedia) {
    const name = item.name || ('home-visit-' + item.kind + '-' + item.id);
    const file = new File([item.blob], name, { type: item.mimeType });
    const shareNavigator = navigator as ShareCapableNavigator;
    const payload: SharePayload = { files: [file], title: name };
    if (shareNavigator.share && shareNavigator.canShare?.(payload)) {
      try {
        await shareNavigator.share(payload);
        setMessage('Choose Photos or Gallery in the share sheet to add a copy there.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(item.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMessage('Downloaded to your device. Your browser may put downloads outside Photos or Gallery.');
  }

  async function removeMedia(item: VisitMedia) {
    if (!window.confirm('Remove this ' + item.kind + ' from this visit?')) return;
    try {
      await deleteVisitMedia(item.id);
      await refresh();
      if (previewId === item.id) setPreviewId('');
      setMessage('Media removed from this visit.');
    } catch {
      setMessage('Could not remove this file from device storage.');
    }
  }

  const preview = media.find(item => item.id === previewId);
  const urlFor = (id: string) => mediaUrls.find(item => item.id === id)?.url || '';

  return <section className="media-card" aria-labelledby="visit-media-heading">
    <div className="media-card-head">
      <div><span className="media-eyebrow">VISIT RECORD</span><h2 id="visit-media-heading">Photos &amp; videos</h2>
        <p>Capture the rooms, view, damage and anything you want to remember.</p></div>
      <span className="media-count">{media.length} {media.length === 1 ? 'file' : 'files'}</span>
    </div>
    <div className="media-actions">
      <button type="button" onClick={() => photoInput.current?.click()} disabled={busy}><Camera size={18}/>Take a photo</button>
      <button type="button" onClick={() => videoInput.current?.click()} disabled={busy}><Video size={18}/>Record a video</button>
      <button type="button" className="media-secondary" onClick={() => libraryInput.current?.click()} disabled={busy}><ImagePlus size={18}/>Choose from device</button>
    </div>
    <input ref={photoInput} className="media-file-input" type="file" accept="image/*" capture="environment" aria-label="Take a photo" onChange={event => { void addFiles(event.currentTarget.files); event.currentTarget.value = ''; }}/>
    <input ref={videoInput} className="media-file-input" type="file" accept="video/*" capture="environment" aria-label="Record a video" onChange={event => { void addFiles(event.currentTarget.files); event.currentTarget.value = ''; }}/>
    <input ref={libraryInput} className="media-file-input" type="file" accept="image/*,video/*" multiple aria-label="Choose photos or videos from device" onChange={event => { void addFiles(event.currentTarget.files); event.currentTarget.value = ''; }}/>
    {media.length > 0 && <div className="media-grid">{media.map(item => <article className="media-item" key={item.id}>
      <button className="media-preview" type="button" onClick={() => setPreviewId(item.id)} aria-label={'Preview ' + item.name}>
        {item.kind === 'photo' ? <img src={urlFor(item.id)} alt={item.name}/> : <video src={urlFor(item.id)} preload="metadata" aria-label={item.name}/>}
        <span className="media-kind">{item.kind === 'photo' ? 'PHOTO' : 'VIDEO'}</span>
      </button>
      <div className="media-item-info"><span title={item.name}>{item.name}</span><small>{new Date(item.createdAt).toLocaleString()}</small></div>
      <div className="media-item-actions">
        <button type="button" onClick={() => void saveToDevice(item)}><Share2 size={16}/>Save to device</button>
        <button type="button" className="media-remove" onClick={() => void removeMedia(item)} aria-label={'Remove ' + item.name}><Trash2 size={16}/></button>
      </div>
    </article>)}</div>}
    <p className="media-storage-note">Stored in this browser on this device only. Use “Save to device” to share a copy or download it; browser downloads may not go straight to Gallery.</p>
    {message && <p className="media-message" role="status">{message}</p>}
    {preview && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label={'Preview ' + preview.name} onClick={event => { if (event.target === event.currentTarget) setPreviewId(''); }}>
      <div className="media-lightbox-content"><button type="button" className="media-close" onClick={() => setPreviewId('')} aria-label="Close preview"><X size={22}/></button>
        {preview.kind === 'photo' ? <img src={urlFor(preview.id)} alt={preview.name}/> : <video src={urlFor(preview.id)} controls autoPlay/>}
        <div><span>{preview.name}</span><button type="button" onClick={() => void saveToDevice(preview)}><Download size={17}/>Save to device</button></div>
      </div>
    </div>}
  </section>;
}
