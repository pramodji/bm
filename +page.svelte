<script lang="ts">
	import { 
		Plus, Search, Bookmark as BookmarkIcon, Trash2, ExternalLink, 
		Settings, X, Edit2, Save, GripVertical, Database as DbIcon, 
		Globe, Download, Upload, FileSpreadsheet, Clock
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Database from '@tauri-apps/plugin-sql';

	const isTauri = !!(window as any).__TAURI_INTERNALS__;
	interface Bookmark { id: string; title: string; url: string; group: string; position: number; }

	// --- 1. APP STATE ---
	let db = $state<any>(null);
	let bookmarks = $state<Bookmark[]>([]);
	let groups = $state<string[]>([]);
	let appTitle = $state("MarkKeeper");
	
	// --- 2. CLOCK & UI STATE ---
	let time = $state(new Date());
	let searchQuery = $state("");
	let isSettingsOpen = $state(false);
	let isEditMode = $state(false);
	let editingGroupId = $state<string | null>(null);
	let groupRenameValue = $state("");
	let newUrl = $state("");
	let newGroupName = $state("");
	let draggedId = $state<string | null>(null);

	// --- 3. EDIT MODAL STATE ---
	let isEditModalOpen = $state(false);
	let activeBookmark = $state<Bookmark | null>(null);
	let tempTitle = $state("");
	let tempUrl = $state("");

	onMount(async () => {
		// Smooth Clock Interval
		const timer = setInterval(() => { time = new Date(); }, 1000);

		if (isTauri) {
			try { 
				db = await Database.load("sqlite:markkeeper.db");
				await db.execute("CREATE TABLE IF NOT EXISTS groups (name TEXT PRIMARY KEY)");
				await db.execute("CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, title TEXT, url TEXT, group_name TEXT, position INTEGER)");
				await db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
			} catch (e) { console.error("DB Init Failed", e); }
		}
		await loadData();
		return () => clearInterval(timer);
	});

	async function loadData() {
		if (isTauri && db) {
			const sRes = await db.select<{value: string}[]>("SELECT value FROM settings WHERE key = 'app_name'");
			if (sRes.length > 0) appTitle = sRes[0].value;
			const gRes = await db.select<{name: string}[]>("SELECT name FROM groups ORDER BY name ASC");
			groups = gRes.length > 0 ? gRes.map((g: any) => g.name) : ["General"];
			const bRes = await db.select<any[]>("SELECT * FROM bookmarks ORDER BY position ASC");
			bookmarks = bRes.map(b => ({ id: b.id, title: b.title, url: b.url, group: b.group_name, position: b.position }));
		} else {
			appTitle = localStorage.getItem('mk_title') || "MarkKeeper";
			groups = JSON.parse(localStorage.getItem('mk_groups') || '["General"]');
			bookmarks = JSON.parse(localStorage.getItem('mk_bookmarks') || '[]');
		}
	}

	async function syncData() {
		localStorage.setItem('mk_title', appTitle);
		localStorage.setItem('mk_groups', JSON.stringify(groups));
		localStorage.setItem('mk_bookmarks', JSON.stringify(bookmarks));
	}

	// --- 4. CORE ACTIONS ---
	function openEditModal(bookmark: Bookmark) {
		activeBookmark = bookmark;
		tempTitle = bookmark.title;
		tempUrl = bookmark.url;
		isEditModalOpen = true;
	}

	function savePopupChanges() {
		if (activeBookmark) {
			bookmarks = bookmarks.map(b => 
				b.id === activeBookmark!.id ? { ...b, title: tempTitle, url: tempUrl } : b
			);
			syncData();
			isEditModalOpen = false;
		}
	}

	function deleteGroup(name: string) {
		if (confirm(`Delete group "${name}" and all its bookmarks?`)) {
			groups = groups.filter(g => g !== name);
			bookmarks = bookmarks.filter(b => b.group !== name);
			syncData();
		}
	}

	// --- 5. IMPORT / EXPORT ---
	function exportJSON() {
		const data = { appTitle, groups, bookmarks };
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = `markkeeper-backup.json`; a.click();
	}

	async function importCSV(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = ev.target?.result as string;
			const rows = text.split('\n').map(row => row.split(','));
			const newBks: Bookmark[] = [];
			const currentGroups = new Set(groups);
			rows.forEach((cols, i) => {
				if (i === 0 && cols[0]?.toLowerCase().includes('title')) return;
				const title = cols[0]?.trim(); const url = cols[1]?.trim(); const g = cols[2]?.trim() || "Imported";
				if (title && url) { 
					currentGroups.add(g); 
					newBks.push({ id: crypto.randomUUID(), title, url: url.startsWith('http') ? url : `https://${url}`, group: g, position: 0 }); 
				}
			});
			groups = Array.from(currentGroups);
			bookmarks = [...bookmarks, ...newBks];
			syncData();
		};
		reader.readAsText(file);
	}

	function handleDrop(targetGroup: string, targetIndex: number) {
		if (draggedId) {
			const movedItem = bookmarks.find(b => b.id === draggedId);
			if (!movedItem) return;
			let otherItems = bookmarks.filter(b => b.id !== draggedId && b.group === targetGroup);
			otherItems.splice(targetIndex, 0, { ...movedItem, group: targetGroup });
			const rest = bookmarks.filter(b => b.group !== targetGroup && b.id !== draggedId);
			bookmarks = [...rest, ...otherItems.map((item, i) => ({ ...item, position: i }))];
			draggedId = null;
		}
		syncData();
	}

	let filteredBookmarks = $derived(bookmarks.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.url.toLowerCase().includes(searchQuery.toLowerCase())));
</script>

<div class="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden font-sans select-none text-slate-900">
	
	<header class="h-12 bg-white border-b flex items-center px-4 justify-between shrink-0 shadow-sm z-10">
		<div class="flex items-center gap-6 flex-1">
			<div class="flex items-center gap-2 text-blue-600 font-bold uppercase tracking-tighter text-xs">
				<BookmarkIcon size={16} /> <span>{appTitle}</span>
			</div>
			<div class="relative w-48">
				<Search class="absolute left-3 top-2 text-slate-400" size={12} />
				<input bind:value={searchQuery} placeholder="Search..." class="w-full pl-8 pr-4 py-1 text-[11px] bg-slate-100 border-none rounded-full outline-none focus:ring-1 focus:ring-blue-200" />
			</div>
		</div>

		<div class="flex items-center gap-3 bg-slate-900 text-white px-5 py-1.5 rounded-full shadow-lg border border-slate-700">
			<Clock size={14} class="text-blue-400 animate-pulse" />
			<span class="font-mono text-[14px] font-black tracking-widest tabular-nums">
				{time.getHours().toString().padStart(2, '0')}<span class="animate-blink">:</span>{time.getMinutes().toString().padStart(2, '0')}<span class="animate-blink">:</span>{time.getSeconds().toString().padStart(2, '0')}
			</span>
		</div>

		<div class="flex items-center gap-4 flex-1 justify-end">
			<div class="hidden md:flex items-center gap-2 px-2 py-0.5 {isTauri ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'} rounded-full border border-current opacity-80">
				{#if isTauri}<DbIcon size={10} />{:else}<Globe size={10} />{/if}
				<span class="text-[8px] font-black uppercase tracking-widest">{isTauri ? 'SQLite' : 'Web'}</span>
			</div>
			<button onclick={() => isSettingsOpen = true} class="p-1.5 hover:bg-slate-100 rounded-full transition-colors"><Settings size={18}/></button>
		</div>
	</header>

	<main class="flex-1 p-4 overflow-y-auto grid gap-6 items-start content-start" 
		  style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
		{#each groups as group (group)}
			<div class="w-full flex flex-col"
				 ondragover={(e) => e.preventDefault()}
				 ondrop={() => handleDrop(group, bookmarks.filter(b => b.group === group).length)}>
				
				<div class="flex items-center justify-between w-full mb-1 px-1 py-1 rounded transition-colors {isEditMode ? 'bg-blue-50 ring-1 ring-blue-100' : ''}">
					{#if editingGroupId === group}
						<div class="flex items-center gap-2 flex-1">
							<input bind:value={groupRenameValue} class="text-[12px] font-black uppercase tracking-[0.1em] border-none outline-none bg-white px-1 w-full" autofocus />
							<button onclick={() => {
								groups = groups.map(g => g === group ? groupRenameValue : g);
								bookmarks = bookmarks.map(b => b.group === group ? { ...b, group: groupRenameValue } : b);
								editingGroupId = null; syncData();
							}} class="text-green-600"><Save size={14}/></button>
						</div>
					{:else}
						<div class="flex items-center gap-2 flex-1">
							<h2 class="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">{group}</h2>
							{#if isEditMode}
								<button onclick={() => { editingGroupId = group; groupRenameValue = group; }} class="text-slate-400 hover:text-blue-600"> <Edit2 size={12}/></button>
							{/if}
						</div>
					{/if}
				</div>

				<div class="flex flex-col bg-white rounded-lg shadow-sm overflow-hidden ring-1 ring-slate-200/50">
					{#if isEditMode}
						<div class="bg-slate-50 p-1.5 flex gap-1 border-b border-slate-100">
							<input bind:value={newUrl} placeholder="Add URL..." class="flex-1 text-[10px] outline-none px-2 bg-white border rounded py-1" />
							<button onclick={() => { 
								if(!newUrl) return;
								const id = crypto.randomUUID();
								const title = newUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
								bookmarks = [...bookmarks, { id, title, url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`, group, position: bookmarks.length }];
								newUrl = ""; syncData();
							}} class="bg-blue-600 text-white px-2 rounded-md"><Plus size={14}/></button>
						</div>
					{/if}

					<div class="divide-y divide-slate-50 flex flex-col">
						{#each filteredBookmarks.filter(b => b.group === group) as b, i (b.id)}
							<div class="bookmark-row px-2 py-1.5 group transition-all {isEditMode ? 'cursor-default' : 'cursor-pointer'}"
								 draggable={isEditMode} 
								 ondragstart={(e) => { e.stopPropagation(); draggedId = b.id; }}
								 ondragover={(e) => e.preventDefault()}
								 ondrop={(e) => { e.stopPropagation(); handleDrop(group, i); }}
								 onclick={() => isEditMode ? openEditModal(b) : window.open(b.url.startsWith('http') ? b.url : `https://${b.url}`, '_blank')}>
								
								<div class="flex items-center gap-2 w-full">
									<GripVertical size={10} class="text-slate-200 shrink-0 {isEditMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}" />
									<img src="https://www.google.com/s2/favicons?domain={b.url}&sz=32" alt="" class="w-3.5 h-3.5 rounded-sm shrink-0" />
									<span class="text-[10px] font-bold text-slate-700 truncate flex-1">{b.title}</span>
									
									{#if isEditMode}
										<div class="flex gap-2 items-center opacity-0 group-hover:opacity-100">
											<Edit2 size={10} class="text-blue-400" />
											<button onclick={(e) => { e.stopPropagation(); bookmarks = bookmarks.filter(bk => bk.id !== b.id); syncData(); }} class="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={12}/></button>
										</div>
									{:else}
										<ExternalLink size={9} class="text-slate-200 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 shrink-0" />
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</main>

	{#if isEditModalOpen}
		<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
			<div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick={() => isEditModalOpen = false}></div>
			<div class="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
				<div class="flex items-center justify-between border-b pb-3">
					<h3 class="text-xs font-black uppercase text-slate-400">Edit Bookmark</h3>
					<button onclick={() => isEditModalOpen = false}><X size={18}/></button>
				</div>
				<div class="space-y-3">
					<input bind:value={tempTitle} class="w-full border p-2 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500" placeholder="Title" />
					<input bind:value={tempUrl} class="w-full border p-2 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500" placeholder="URL" />
				</div>
				<button onclick={savePopupChanges} class="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold uppercase hover:bg-blue-700 transition-colors">Save Changes</button>
			</div>
		</div>
	{/if}

	{#if isSettingsOpen}
		<div class="fixed inset-0 z-50 flex justify-end">
			<div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onclick={() => isSettingsOpen = false}></div>
			<div class="relative w-80 bg-white h-full shadow-2xl p-6 flex flex-col gap-6 overflow-y-auto">
				<div class="flex justify-between items-center border-b pb-4">
					<h3 class="font-black text-[11px] uppercase tracking-[0.2em] text-slate-400">Master Config</h3>
					<button onclick={() => isSettingsOpen = false}><X size={18}/></button>
				</div>
				
				<button onclick={() => { isEditMode = !isEditMode; isSettingsOpen = false; }} class="w-full py-3 rounded-xl border-2 font-black text-[10px] tracking-widest transition-all {isEditMode ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'text-slate-500 hover:bg-slate-50'} uppercase">
					{isEditMode ? 'Lock UI' : 'Unlock Editor'}
				</button>

				<div class="space-y-6">
					<div class="space-y-2 pt-4 border-t">
						<label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data Migration</label>
						<div class="grid grid-cols-2 gap-2">
							<button onclick={exportJSON} class="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border rounded-lg text-[9px] font-bold uppercase hover:bg-slate-100"><Download size={12}/> Backup</button>
							<label class="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border rounded-lg text-[9px] font-bold uppercase cursor-pointer hover:bg-slate-100">
								<Upload size={12}/> JSON <input type="file" accept=".json" class="hidden" />
							</label>
						</div>
						<label class="flex items-center justify-center gap-2 w-full p-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[9px] font-black uppercase cursor-pointer hover:bg-blue-100 transition-colors mt-2">
							<FileSpreadsheet size={12}/> Import CSV
							<input type="file" accept=".csv" onchange={importCSV} class="hidden" />
						</label>
					</div>

					<div class="space-y-2 pt-4 border-t">
						<label class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Manage Groups</label>
						<div class="flex gap-2">
							<input bind:value={newGroupName} placeholder="Group Name..." class="flex-1 border p-2 rounded-lg text-xs outline-none" />
							<button onclick={() => { if(newGroupName) { groups=[...groups, newGroupName]; newGroupName=""; syncData(); } }} class="bg-blue-600 text-white px-3 rounded-lg"><Plus size={16}/></button>
						</div>
						<div class="mt-4 space-y-1">
							{#each groups as g}
								<div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 group/gitem">
									<span class="text-[10px] font-bold">{g}</span>
									<button onclick={() => deleteGroup(g)} class="text-slate-300 hover:text-red-500 opacity-0 group-hover/gitem:opacity-100 transition-opacity"><Trash2 size={13}/></button>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) { margin: 0; background: #f8fafc; overflow: hidden; height: 100vh; width: 100vw; }
	::-webkit-scrollbar { width: 5px; }
	::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
	.bookmark-row:hover:not(.cursor-default) { background-color: #f1f5f9; box-shadow: inset 3px 0 0 #3b82f6; }

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
	.animate-blink {
		display: inline-block;
		animation: blink 1s step-end infinite;
		color: #60a5fa;
		margin: 0 1px;
	}
</style>
