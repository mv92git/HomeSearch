import { useState } from 'react';
import { Home, blank, load, total, sections } from './checklist';
import Compare from './Compare';
import MediaGallery from './MediaGallery';

export default function App() {
  const [homes, setHomes] = useState<Home[]>(load);
  const [id, setId] = useState(load()[0]?.id || '');
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState(['entry', 'inside']);
  const home = homes.find(item => item.id === id);
  const done = home ? Object.values(home.checks).filter(Boolean).length : 0;
  const pct = Math.round((done / total) * 100);
  const floorCount = Math.max(1, Math.min(60, Number(home?.totalFloors) || 60));

  const save = (items: Home[]) => {
    setHomes(items);
    localStorage.setItem('homesearch.v1', JSON.stringify(items));
  };
  const update = (patch: Partial<Home>) => {
    if (home) save(homes.map(item => item.id === id ? { ...item, ...patch } : item));
  };
  const add = () => {
    const item = blank();
    save([item, ...homes]);
    setId(item.id);
    setCompare(false);
  };
  const remove = () => {
    if (home && confirm('Remove this home?')) {
      const remaining = homes.filter(item => item.id !== id);
      save(remaining);
      setId(remaining[0]?.id || '');
    }
  };
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(homes, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'homesearch-visits.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="app">
    <header><a className="brand"><i>⌂</i>HomeSearch<span>.</span></a><small>● Saved on this device</small></header>
    <div className="shell">
      <aside>
        <div className="side-title">YOUR SHORTLIST <button onClick={add}>＋ New visit</button></div>
        <nav>{homes.map(item => <button className={item.id === id && !compare ? 'selected' : ''} key={item.id} onClick={() => { setId(item.id); setCompare(false); }}>
          <b>⌂ {item.name || 'Untitled home'}</b><small>{item.area || 'Add location'} · {Object.values(item.checks).filter(Boolean).length}/{total}</small>
        </button>)}</nav>
        <div className="side-bottom">
          <button onClick={() => setCompare(true)}>▦ Compare homes ({homes.length})</button>
          <button onClick={exportData} disabled={!homes.length}>↓ Export visits</button>
          <small>Notes stay in this browser.</small>
        </div>
      </aside>
      <main>
        {compare ? <Compare homes={homes} openHome={item => { setId(item.id); setCompare(false); }} /> : home ? <>
          <div className="crumb">HOME VISIT / CHECKLIST</div>
          <div className="title"><div><h1>Evaluate the home<span>.</span></h1><p>A calm walkthrough for your next house visit.</p></div><button className="quiet" onClick={remove}>Remove</button></div>
          <section className="property">
            <b>PROPERTY DETAILS</b>
            <div className="field-group">
              <h3>Property &amp; location</h3>
              <div className="fields">
                <label>Property / society<input type="text" placeholder="e.g. Gulshan Vivante" value={home.name} onChange={event => update({ name: event.target.value })}/></label>
                <label>Sector / locality<input type="text" placeholder="e.g. Sector 137, Noida" value={home.area} onChange={event => update({ area: event.target.value })}/></label>
                <label>Configuration (BHK)<select value={home.bhk || ''} onChange={event => update({ bhk: event.target.value })}>
                  <option value="">Select BHK</option>{['2', '2.5', '3', '3.5'].map(value => <option key={value} value={value}>{value} BHK</option>)}
                </select></label>
                <label>Area / size<input type="text" placeholder="e.g. 1,050 sq ft" value={home.size} onChange={event => update({ size: event.target.value })}/></label>
              </div>
            </div>
            <div className="field-group">
              <h3>Rent &amp; costs</h3>
              <div className="fields">
                <label>Monthly rent<input type="number" placeholder="₹ 35,000" value={home.rent} onChange={event => update({ rent: event.target.value })}/></label>
                <label>Security deposit<input type="number" placeholder="₹ 70,000" value={home.deposit} onChange={event => update({ deposit: event.target.value })}/></label>
                <label>Maintenance / month<input type="text" placeholder="Included or ₹ amount" value={home.maintenance} onChange={event => update({ maintenance: event.target.value })}/></label>
                <label>Brokerage / agent fee<input type="text" placeholder="₹ amount, terms, or none" value={home.brokerage || ''} onChange={event => update({ brokerage: event.target.value })}/></label>
              </div>
            </div>
            <div className="field-group">
              <h3>Building &amp; visit</h3>
              <div className="fields">
                <label>Floor<select value={home.floor || ''} onChange={event => update({ floor: event.target.value })}>
                  <option value="">Select floor</option><option value="0">Ground floor</option>
                  {Array.from({ length: floorCount }, (_, index) => index + 1).map(value => <option key={value} value={String(value)}>Floor {value}</option>)}
                </select></label>
                <label>Total floors<select value={home.totalFloors || ''} onChange={event => {
                  const value = event.target.value;
                  update({ totalFloors: value, ...(Number(home.floor) > Number(value) ? { floor: '' } : {}) });
                }}>
                  <option value="">Select total floors</option>{Array.from({ length: 60 }, (_, index) => index + 1).map(value => <option key={value} value={String(value)}>{value} floors</option>)}
                </select></label>
              </div>
            </div>
            <label className="date">Visit date <input type="date" value={home.date} onChange={event => update({ date: event.target.value })}/></label>
          </section>
          <div className="progress"><b>{done}/{total} checks</b><span>{pct}%</span><i><em style={{ width: pct + '%' }}/></i></div>
          <div className="walk-head"><h2>Check as you go</h2><small>Tap a row to mark it done</small></div>
          <div className="checklist">{sections.map(section => <section className="section" key={section.id}>
            <button className="section-head" onClick={() => setOpen(open.includes(section.id) ? open.filter(item => item !== section.id) : [...open, section.id])}>{section.title}<small>{section.items.filter(item => home.checks[item.id]).length}/{section.items.length}</small><b>{open.includes(section.id) ? '⌃' : '⌄'}</b></button>
            {open.includes(section.id) && <div className="items">{section.items.map(item => <button className={'item ' + (home.checks[item.id] ? 'done' : '')} key={item.id} onClick={() => update({ checks: { ...home.checks, [item.id]: !home.checks[item.id] } })}>
              <i>{home.checks[item.id] ? '✓' : ''}</i><span><b>{item.label}</b><small>{item.hint}</small></span>
            </button>)}<div className="rating"><span>Rate this section</span>{[1, 2, 3, 4, 5].map(value => <button className={home.ratings[section.id] === value ? 'chosen' : ''} key={value} onClick={() => update({ ratings: { ...home.ratings, [section.id]: value } })}>{value}</button>)}</div></div>}
          </section>)}</div>
          <MediaGallery home={home}/>
          <section className="notes"><b>Things to remember</b><p>Questions for the owner, follow-ups, or anything that stood out.</p><textarea value={home.notes} onChange={event => update({ notes: event.target.value })} placeholder="e.g. Ask if the washing machine is included…"/></section>
          <footer>⌖ Made for real house visits <button onClick={() => { if (confirm('Clear all checks and ratings?')) update({ checks: {}, ratings: {} }); }}>Reset checklist</button><button onClick={() => window.print()}>Print</button></footer>
        </> : <div className="welcome"><i>⌂</i><small>YOUR NEXT HOME, CONSIDERED</small><h1>Choose with<br/>a clearer head<span>.</span></h1><p>Keep every visit, detail and gut check in one place. Add your first home when the broker calls.</p><button onClick={add}>＋ Add your first home</button></div>}
      </main>
    </div>
  </div>;
}
