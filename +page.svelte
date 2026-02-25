<script lang="ts">
	import { 
		Plus, Search, Bookmark as BookmarkIcon, Trash2, ExternalLink, 
		Settings, X, Edit2, Save, GripVertical, Database as DbIcon, 
		Globe, Download, Upload, FileSpreadsheet, Layers, Clock, 
		Tag, LayoutGrid, List, Moon, Sun, Palette, Check, Info, Image as ImageIcon
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Database from '@tauri-apps/plugin-sql';

	const isTauri = !!(window as any).__TAURI_INTERNALS__;

	// --- 1. APP STATE ---
	interface Bookmark { 
		id: string; title: string; url: string; group: string; position: number;
		tags?: string[]; notes?: string; icon?: string; 
	}

	let db = $state<any>(null);
	let bookmarks = $state<Bookmark[]>([]);
	let groups = $state<string[]>([]);
	let appTitle = $state("MarkKeeper");
	
	// --- 2. UI & THEME STATE ---
	let time = $state(new Date());
	let searchQuery = $state("");
	let selectedTag = $state<string | null>(null);
	let isSettingsOpen = $state(false);
	let isEditMode = $state(false);
	let isDarkMode = $state(false);
	let accentColor = $state("blue"); 
	let viewLayout = $state<"grid" | "list">("grid");
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
	let tempTags = $state("");
	let tempNotes = $state("");
	let tempIcon = $state("");

	const themeMap: Record<string, string> = {
		blue: "#2563eb", emerald: "#10b981", purple: "#8b5cf6", rose: "#f43f5e", amber: "#f59e0b"
	};

	onMount(async () => {
		const timer = setInterval(() => { time = new Date(); }, 1000);
		isDarkMode = localStorage.getItem('mk_dark') === 'true';
		accentColor = localStorage.getItem('mk_accent') || "blue";
		viewLayout = (localStorage.getItem('mk_layout') as any) || "grid";

		if (isTauri) {
			try { 
				db = await Database.load("sqlite:markkeeper.db");
				await db.execute("CREATE TABLE IF NOT EXISTS groups (name TEXT PRIMARY KEY)");
				await db.execute("CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, title TEXT, url TEXT, group_name TEXT, position INTEGER, tags TEXT, notes TEXT, icon TEXT)");
			} catch (e) { console.error("DB Init Failed", e); }
		}
		await loadData();
		return () => clearInterval(timer);
	});

	async function loadData() {
		if (isTauri && db) {
			const gRes = await db.select<{name: string}[]>("SELECT name FROM groups ORDER BY name ASC");
			groups = gRes.length > 0 ? gRes.map((g: any) => g.name) : ["General"];
			const bRes = await db.select<any[]>("SELECT * FROM bookmarks ORDER BY position ASC");
			bookmarks = bRes.map(b => ({ 
				...b, group: b.group_name, 
				tags: b.tags ? JSON.parse(b.tags) : [], 
				notes: b.notes || "",
				icon: b.icon || ""
			}));
		} else {
			appTitle = localStorage.getItem('mk_title') || "MarkKeeper";
			groups = JSON.parse(localStorage.getItem('mk_groups') || '["General"]');
			bookmarks = JSON.parse(localStorage.getItem('mk_bookmarks') || '[]').map((b: any) => ({
				...b, tags: b.tags || [], notes: b.notes || "", icon: b.icon || ""
			}));
		}
	}

	async function syncData() {
		localStorage.setItem('mk_title', appTitle);
		localStorage.setItem('mk_groups', JSON.stringify(groups));
		localStorage.setItem('mk_bookmarks', JSON.stringify(bookmarks));
		localStorage.setItem('mk_dark', isDarkMode.toString());
		localStorage.setItem('mk_accent', accentColor);
		localStorage.setItem('mk_layout', viewLayout);
	}

	function openEditModal(bookmark: Bookmark) {
		activeBookmark = bookmark;
		tempTitle = bookmark.title;
		tempUrl = bookmark.url;
		tempTags = bookmark.tags?.join(", ") || "";
		tempNotes = bookmark.notes || "";
		tempIcon = bookmark.icon || "";
		isEditModalOpen = true;
	}

	function savePopupChanges() {
		if (activeBookmark) {
			const tagArray = tempTags.split(",").map(t => t.trim()).filter(t => t !== "");
			bookmarks = bookmarks.map(b => 
				b.id === activeBookmark!.id ? { ...b, title: tempTitle, url: tempUrl, tags: tagArray, notes: tempNotes, icon: tempIcon } : b
			);
			syncData();
			isEditModalOpen = false;
		}
	}

	function handleIconError(e: Event) {
		const img = e.target as HTMLImageElement;
		img.style.display = 'none';
		const fallback = img.nextElementSibling;
		if (fallback) {
			fallback.classList.remove('hidden');
			fallback.classList.add('flex');
		}
	}

	function deleteGroup(name: string) {
		if (confirm(`Delete group "${name}" and all its bookmarks?`)) {
			groups = groups.filter(g => g !== name);
			bookmarks = bookmarks.filter(b => b.group !== name);
			syncData();
		}
	}

	function exportJSON() {
		const data = { appTitle, groups, bookmarks, version: "5.0" };
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
					newBks.push({ id: crypto.randomUUID(), title, url: url.startsWith('http') ? url : `https://${url}`, group: g, position: 0, tags: [], notes: "", icon: "" }); 
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

	let allUniqueTags = $derived(Array.from(new Set(bookmarks.flatMap(b => b.tags || []))).sort());
	let filteredBookmarks = $derived(bookmarks.filter(b => {
		const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
							 b.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
							 b.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
		const matchesTag = !selectedTag || b.tags?.includes(selectedTag);
		return matchesSearch && matchesTag;
	}));
</script>

<div class="{isDarkMode ? 'dark' : ''} h-screen w-screen transition-colors duration-300" style="--brand: {themeMap[accentColor]}">
	<div class="h-full w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans select-none flex flex-col overflow-hidden">
		
		<header class="h-14 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-20">
			<div class="flex items-center gap-6 flex-1">
				<div class="flex items-center gap-2 font-bold uppercase tracking-tighter text-xs" style="color: var(--brand)">
					<BookmarkIcon size={18} fill="currentColor" fill-opacity="0.2" /> 
					<span>{appTitle}</span>
				</div>
				<div class="relative w-64">
					<Search class="absolute left-3 top-2.5 text-slate-400" size={14} />
					<input bind:value={searchQuery} placeholder="Search titles, tags, or notes..." 
						class="w-full pl-10 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-xl outline-none" />
				</div>
			</div>

			<div class="hidden md:flex items-center gap-3 bg-slate-900 text-white px-5 py-2 rounded-full border border-slate-700">
				<Clock size={14} class="text-blue-400 animate-pulse" />
				<span class="font-mono text-xs tracking-widest tabular-nums">
					{time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}:{time.getSeconds().toString().padStart(2, '0')}
				</span>
			</div>

			<div class="flex items-center gap-3 flex-1 justify-end">
				<div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
					<button onclick={() => {viewLayout = "grid"; syncData();}} class="p-1.5 rounded-lg {viewLayout === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400'}"><LayoutGrid size={14}/></button>
					<button onclick={() => {viewLayout = "list"; syncData();}} class="p-1.5 rounded-lg {viewLayout === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-400'}"><List size={14}/></button>
				</div>
				<button onclick={() => {isDarkMode = !isDarkMode; syncData();}} class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
					{#if isDarkMode}<Sun size={18}/>{:else}<Moon size={18}/>{/if}
				</button>
				<button onclick={() => isSettingsOpen = true} class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><Settings size={18}/></button>
			</div>
		</header>

		<div class="px-4 py-2 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
			<button onclick={() => selectedTag = null} 
				class="px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all {selectedTag === null ? 'bg-slate-900 text-white dark:bg-white dark:text-black' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
				All
			</button>
			{#each allUniqueTags as tag}
				<button onclick={() => selectedTag = (selectedTag === tag ? null : tag)} 
					class="px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all 
					{selectedTag === tag ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}"
					style={selectedTag === tag ? `background-color: var(--brand)` : ''}>
					#{tag}
				</button>
			{/each}
		</div>

		<main class="flex-1 p-6 overflow-y-auto grid gap-8 items-start content-start" 
			  style={viewLayout === 'grid' ? "grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));" : "grid-template-columns: 1fr;"}>
			
			{#each groups as group (group)}
				<section class="flex flex-col">
					<div class="flex items-center justify-between mb-2 px-1">
						{#if editingGroupId === group}
							<div class="flex gap-1 w-full">
								<input bind:value={groupRenameValue} class="bg-transparent border-b border-blue-500 outline-none text-[11px] font-black uppercase w-full" autofocus />
								<button onclick={() => { groups = groups.map(g => g === group ? groupRenameValue : g); bookmarks = bookmarks.map(b => b.group === group ? {...b, group: groupRenameValue} : b); editingGroupId = null; syncData(); }} class="text-green-500"><Check size={14}/></button>
							</div>
						{:else}
							<h2 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{group}</h2>
							{#if isEditMode}
								<div class="flex gap-2">
									<button onclick={() => {editingGroupId = group; groupRenameValue = group;}} class="text-slate-400 hover:text-blue-500"><Edit2 size={12}/></button>
									<button onclick={() => deleteGroup(group)} class="text-slate-400 hover:text-red-500"><Trash2 size={12}/></button>
								</div>
							{/if}
						{/if}
					</div>

					<div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden divide-y dark:divide-slate-800"
						 ondragover={(e) => e.preventDefault()}
						 ondrop={() => handleDrop(group, bookmarks.filter(b => b.group === group).length)}>
						
						{#if isEditMode}
							<div class="p-2 bg-slate-50 dark:bg-slate-800/50 flex gap-1">
								<input bind:value={newUrl} placeholder="Add URL..." class="flex-1 text-[10px] p-2 bg-white dark:bg-slate-900 rounded border dark:border-slate-700 outline-none" />
								<button onclick={() => { if(!newUrl) return; bookmarks = [...bookmarks, { id: crypto.randomUUID(), title: newUrl.split('/')[2] || newUrl, url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`, group, position: bookmarks.length, tags: [], notes: "", icon: "" }]; newUrl = ""; syncData(); }} 
									class="text-white px-3 rounded-lg" style="background-color: var(--brand)"><Plus size={14}/></button>
							</div>
						{/if}

						{#each filteredBookmarks.filter(b => b.group === group) as b, i (b.id)}
							<div class="bookmark-row p-2.5 group flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
								 draggable={isEditMode} 
								 ondragstart={(e) => { e.stopPropagation(); draggedId = b.id; }}
								 ondragover={(e) => e.preventDefault()}
								 ondrop={(e) => { e.stopPropagation(); handleDrop(group, i); }}
								 onclick={() => isEditMode ? openEditModal(b) : window.open(b.url.startsWith('http') ? b.url : `https://${b.url}`, '_blank')}>
								
								<GripVertical size={12} class="text-slate-300 dark:text-slate-600 {isEditMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}" />
								
								<div class="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden rounded-sm relative">
									<img src={b.icon || `https://www.google.com/s2/favicons?domain=${b.url}&sz=32`} 
										 alt="" class="w-full h-full object-contain" onerror={handleIconError} />
									<div class="hidden absolute inset-0 text-blue-500 items-center justify-center bg-slate-100 dark:bg-slate-800">
										<BookmarkIcon size={12} />
									</div>
								</div>
								
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between">
										<h3 class="text-xs font-bold text-slate-700 dark:text-slate-200 truncate leading-tight">{b.title}</h3>
										<ExternalLink size={10} class="text-slate-300 opacity-0 group-hover:opacity-100" />
									</div>
									{#if b.tags?.length || b.notes}
										<div class="flex items-center gap-2 mt-0.5">
											{#each b.tags || [] as tag}
												<span class="text-[8px] font-black uppercase text-blue-500">#{tag}</span>
											{/each}
											{#if b.notes}
												<span class="text-[9px] text-slate-400 italic truncate ml-auto">{b.notes}</span>
											{/if}
										</div>
									{/if}
								</div>

								{#if isEditMode}
									<button onclick={(e) => { e.stopPropagation(); bookmarks = bookmarks.filter(bk => bk.id !== b.id); syncData(); }} class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</main>

		{#if isEditModalOpen}
			<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
				<div class="bg-white dark:bg-slate-900 w-full max-sm:max-w-xs max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl">
					<div class="flex items-center justify-between border-b dark:border-slate-800 pb-3">
						<h3 class="text-xs font-black uppercase text-slate-400 tracking-widest">Modify Bookmark</h3>
						<button onclick={() => isEditModalOpen = false} class="dark:text-white"><X size={18}/></button>
					</div>
					<div class="space-y-3">
						<div class="space-y-1">
							<label class="text-[9px] font-black uppercase text-slate-400">Title</label>
							<input bind:value={tempTitle} class="w-full bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl text-sm outline-none" />
						</div>
						<div class="space-y-1">
							<label class="text-[9px] font-black uppercase text-slate-400">URL</label>
							<input bind:value={tempUrl} class="w-full bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl text-sm outline-none" />
						</div>
						<div class="space-y-1">
							<label class="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1"><ImageIcon size={10}/> Custom Icon URL</label>
							<input bind:value={tempIcon} placeholder="e.g. https://.../image.png" class="w-full bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl text-sm outline-none" />
						</div>
						<div class="space-y-1">
							<label class="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1"><Tag size={10}/> Tags</label>
							<input bind:value={tempTags} placeholder="work, design..." class="w-full bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl text-sm outline-none" />
						</div>
						<div class="space-y-1">
							<label class="text-[9px] font-black uppercase text-slate-400">Notes</label>
							<textarea bind:value={tempNotes} class="w-full bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl text-sm outline-none h-16 resize-none"></textarea>
						</div>
					</div>
					<button onclick={savePopupChanges} class="w-full py-3 rounded-xl font-bold text-white uppercase tracking-widest shadow-lg" style="background-color: var(--brand)">Save Changes</button>
				</div>
			</div>
		{/if}

		{#if isSettingsOpen}
			<div class="fixed inset-0 z-[100] flex justify-end">
				<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => isSettingsOpen = false}></div>
				<div class="relative w-80 bg-white dark:bg-slate-900 h-full p-8 shadow-2xl flex flex-col gap-6 overflow-y-auto">
					<div class="flex justify-between items-center border-b dark:border-slate-800 pb-4">
						<h3 class="font-black text-xs uppercase tracking-widest text-slate-400">Settings</h3>
						<button onclick={() => isSettingsOpen = false} class="dark:text-white"><X/></button>
					</div>
					
					<button onclick={() => { isEditMode = !isEditMode; isSettingsOpen = false; }} 
						class="w-full py-4 rounded-2xl border-2 font-black text-xs tracking-widest transition-all 
						{isEditMode ? 'text-white border-transparent' : 'text-slate-400 border-slate-100 dark:border-slate-800'}"
						style={isEditMode ? `background-color: var(--brand)` : ''}>
						{isEditMode ? 'LOCK INTERFACE' : 'UNLOCK EDITOR'}
					</button>

					<div class="space-y-4">
						<label class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Palette size={14}/> Accent Color</label>
						<div class="flex gap-3">
							{#each Object.keys(themeMap) as color}
								<button onclick={() => {accentColor = color; syncData();}} class="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110" style="background-color: {themeMap[color]}">
									{#if accentColor === color}<Check size={14} class="text-white"/>{/if}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-4 pt-4 border-t dark:border-slate-800">
						<label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Tools</label>
						<div class="grid grid-cols-2 gap-2">
							<button onclick={exportJSON} class="flex items-center justify-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-[9px] font-bold uppercase hover:bg-slate-100 transition-colors"><Download size={12}/> Backup JSON</button>
							<label class="flex items-center justify-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-[9px] font-bold uppercase cursor-pointer hover:bg-slate-100 transition-colors">
								<FileSpreadsheet size={12}/> Import CSV <input type="file" accept=".csv" onchange={importCSV} class="hidden" />
							</label>
						</div>
						<p class="text-[8px] text-slate-400 text-center font-bold">CSV Format: Title, URL, Group</p>
					</div>

					<div class="space-y-4 pt-4 border-t dark:border-slate-800">
						<label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage Groups</label>
						<div class="flex gap-2">
							<input bind:value={newGroupName} placeholder="Name..." class="flex-1 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-xs outline-none" />
							<button onclick={() => { if(newGroupName) { groups=[...groups, newGroupName]; newGroupName=""; syncData(); } }} class="text-white p-2 rounded-lg" style="background-color: var(--brand)"><Plus/></button>
						</div>
						<div class="mt-4 space-y-1">
							{#each groups as g}
								<div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg border dark:border-slate-700 group/gitem">
									<span class="text-[10px] font-bold">{g}</span>
									<button onclick={() => deleteGroup(g)} class="text-slate-300 hover:text-red-500 opacity-0 group-hover/gitem:opacity-100 transition-opacity"><Trash2 size={13}/></button>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) { margin: 0; overflow: hidden; height: 100vh; width: 100vw; font-family: system-ui, sans-serif; }
	.no-scrollbar::-webkit-scrollbar { display: none; }
	.bookmark-row:hover:not(.cursor-default) { background-color: rgba(59, 130, 246, 0.05); box-shadow: inset 3px 0 0 var(--brand); }
</style>
