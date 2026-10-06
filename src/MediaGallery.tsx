import { useEffect, useMemo, useRef, useState } from 'react';
import { Home, sections, total } from './checklist';

type IconName = 'camera' | 'video' | 'image' | 'share' | 'trash' | 'download' | 'close';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  switch (name) {
    case 'camera': return <svg {...props}><path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>;
    case 'video': return <svg {...props}><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/></svg>;
    case 'image': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/><path d="M19 2v6M16 5h6"/></svg>;
    case 'share': return <svg {...props}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.1"/></svg>;
    case 'trash': return <svg {...props}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>;
    case 'download': return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
    case 'close': return <svg {...props}><path d="m18 6-12 12M6 6l12 12"/></svg>;
  }
}

type VisitMedia = {
  id: string;
  homeId: string;
  kind: 'photo' | 'video';
  name: string;
  mimeType: string;
  createdAt: number;
  blob: Blob;
};type SharePayload = { files?: File[]; title?: string; text?: string };
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
  }}

export default function MediaGallery({ home }: { home: Home }) {
  const homeId = home.id;
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
      setMessage('Saved with this visit on this device.')
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

  async function shareVisit() {
    const floor = home.floor === '0' ? 'Ground floor' : home.floor ? 'Floor ' + home.floor : 'Not noted';
    const rent = home.rent ? (Number.isFinite(Number(home.rent)) ? '₹' + Number(home.rent).toLocaleString('en-IN') : home.rent) : 'Not noted';
    const deposit = home.deposit ? (Number.isFinite(Number(home.deposit)) ? '₹' + Number(home.deposit).toLocaleString('en-IN') : home.deposit) : 'Not noted';
    const lines = [
      '*🏠 Home visit summary*',
      '*Property:* ' + (home.name || 'Not named'),
      '*Locality:* ' + (home.area || 'Not noted'),
      '*Configuration:* ' + (home.bhk ? home.bhk + ' BHK' : 'Not noted') + (home.size ? ' · ' + home.size : ''),
      '*Monthly rent:* ' + rent,
      '*Security deposit:* ' + deposit,
      '*Maintenance:* ' + (home.maintenance || 'Not noted'),
      '*Brokerage / agent fee:* ' + (home.brokerage || 'Not noted'),
      '*Floor:* ' + floor + (home.totalFloors ? ' of ' + home.totalFloors : ''),
      '*Visit date:* ' + (home.date ? new Date(home.date + 'T00:00:00').toLocaleDateString('en-IN') : 'Not noted'),
      '',
      '*Section scores*',
    ];
    sections.forEach(section => {
      const score = home.ratings[section.id];
      lines.push('• ' + section.title + ': ' + (score ? score + '/5' : 'Not rated'));
    });
    if (home.notes.trim()) lines.push('', '*Notes:* ' + home.notes.trim());
    if (media.length) lines.push('', '*Attachments:* ' + media.length + ' photo/video file' + (media.length === 1 ? '' : 's'));
    const text = lines.join('\n');
    const files = media.map(item => {
      const mimeType = item.mimeType || item.blob.type || (item.kind === 'photo' ? 'image/jpeg' : 'video/mp4');
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]?.split(';')[0] || (item.kind === 'photo' ? 'jpg' : 'mp4');
      const originalName = item.name || 'home-visit-' + item.kind + '-' + item.id;
      const name = /\.[a-z0-9]{2,5}$/i.test(originalName) ? originalName : originalName + '.' + extension;
      return new File([item.blob], name, { type: mimeType, lastModified: item.createdAt });
    });
    const shareNavigator = navigator as ShareCapableNavigator;
    if (files.length) {
        if (!shareNavigator.share) {
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        setMessage('This browser cannot hand the media to another app. The summary was copied; use “Save to device” on each file to attach it manually. No text-only WhatsApp draft was opened.');
        return;
      }
      try {
        const sharing = shareNavigator.share({ files, text });
        const copied = navigator.clipboard?.writeText(text).then(() => true).catch(() => false) ?? Promise.resolve(false);
        const summaryCopied = await copied;
        await sharing;
        setMessage(summaryCopied
          ? 'Review media and summary before sending.'
          : 'Review media and summary before sending.');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessage('The phone could not pass the media to its share sheet. The files are still saved with this visit. Try again or use “Save to device”.');
      }
      return;
    }
    const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setMessage('WhatsApp opened with the formatted visit summary.');
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
      <button type="button" onClick={() => photoInput.current?.click()} disabled={busy}><Icon name="camera" size={18}/>Take a photo</button>
      <button type="button" onClick={() => videoInput.current?.click()} disabled={busy}><Icon name="video" size={18}/>Record a video</button>
      <button type="button" className="media-secondary" onClick={() => libraryInput.current?.click()} disabled={busy}><Icon name="image" size={18}/>Choose from device</button>
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
        <button type="button" onClick={() => void saveToDevice(item)}><Icon name="share" size={16}/>Save to device</button>
        <button type="button" className="media-remove" onClick={() => void removeMedia(item)} aria-label={'Remove ' + item.name}><Icon name="trash" size={16}/></button>
      </div>
    </article>)}</div>}
    <div className="media-whatsapp">
      <button type="button" onClick={() => void shareVisit()}><Icon name="share" size={18}/>Share visit on WhatsApp</button>
      <small>Media and summary share together.</small>
    </div>
    <p className="media-storage-note">Stored in this browser on this device only. Use “Save to device” to share a copy or download it; browser downloads may not go straight to Gallery.</p>
    {message && <p className="media-message" role="status">{message}</p>}
    {preview && <div className="media-lightbox" role="dialog" aria-modal="true" aria-label={'Preview ' + preview.name} onClick={event => { if (event.target === event.currentTarget) setPreviewId(''); }}>
      <div className="media-lightbox-content"><button type="button" className="media-close" onClick={() => setPreviewId('')} aria-label="Close preview"><Icon name="close" size={22}/></button>
        {preview.kind === 'photo' ? <img src={urlFor(preview.id)} alt={preview.name}/> : <video src={urlFor(preview.id)} controls autoPlay/>}
        <div><span>{preview.name}</span><button type="button" onClick={() => void saveToDevice(preview)}><Icon name="download" size={17}/>Save to device</button></div>
      </div>
    </div>}
  </section>;
}
