<script lang="ts">
	import { 
		Plus, Search, Bookmark as BookmarkIcon, Trash2, Edit2, ExternalLink,
		GripVertical, Settings, X, Moon, Sun, Check, Lock, Unlock,
		FileSpreadsheet, Download, Upload, RefreshCw, AlertCircle, Save,
		Tag, Image as ImageIcon, Clock, Copy, CopyPlus, Filter, LayoutList, List, EyeOff, SortAsc, SortDesc,
		Database, Wifi, WifiOff, ChevronRight
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

    const API_URL = 'http://localhost:3000/db';

	// --- 1. STATE ---
	interface Bookmark { 
		id: string; title: string; url: string; group: string; position: number;
		tags?: string[]; notes?: string; icon?: string; 
	}

	let bookmarks = $state<Bookmark[]>([]);
	let groups = $state<string[]>([]);
	let appTitle = $state("Bookmark");
    let syncStatus = $state<"loading" | "synced" | "offline">("loading");
    let time = $state(new Date());
    let collapsedGroups = $state<Record<string, boolean>>({});

	// UI State
	let searchQuery = $state("");
	let selectedTag = $state<string | null>(null);
	let isSettingsOpen = $state(false);
	let isEditMode = $state(false);
	let isDarkMode = $state(false);
    let showTags = $state(false); 
    let compactMode = $state(true); 
	let accentColor = $state("blue"); 
	let columnInputs = $state<Record<string, string>>({}); 
	let draggedId = $state<null | string>(null);
    let newGroupName = $state("");

    // Sorting & Group Editing
    let groupSortDirections = $state<Record<string, 'none' | 'asc' | 'desc'>>({});
    let editingGroupId = $state<string | null>(null);
    let groupRenameValue = $state("");

	// Modals & Context
	let isEditModalOpen = $state(false);
	let activeBookmark = $state<Bookmark | null>(null);
	let contextMenu = $state<{ x: number, y: number, show: boolean, target: Bookmark | null }>({ x: 0, y: 0, show: false, target: null });

	let tempTitle = $state(""), tempUrl = $state(""), tempTags = $state(""), tempNotes = $state(""), tempIcon = $state("");

	const themeMap: Record<string, string> = {
		blue: "#2563eb", emerald: "#10b981", purple: "#8b5cf6", rose: "#f43f5e", amber: "#f59e0b"
	};

    const isSVG = (str: string) => str?.trim().startsWith('<svg') || str?.trim().startsWith('<i ');

	// --- 2. LIFECYCLE ---
	onMount(async () => {
        const timer = setInterval(() => { time = new Date(); }, 1000);
		isDarkMode = localStorage.getItem('mk_dark') === 'true';
		accentColor = localStorage.getItem('mk_accent') || "blue";
		await loadData();
        window.addEventListener('click', () => { contextMenu.show = false; });
        return () => { clearInterval(timer); };
	});

    $effect(() => {
        document.title = appTitle; 
        if (isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    });

	// --- 3. DATA & IMPORTS ---
	async function loadData() {
        syncStatus = "loading";
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error();
            const data = await res.json();
            bookmarks = (data.bookmarks || []).sort((a: Bookmark, b: Bookmark) => a.position - b.position);
            groups = data.groups || ["General"];
            groupSortDirections = data.sorts || {};
            collapsedGroups = data.collapsed || {};
            syncStatus = "synced";
        } catch (e) {
            syncStatus = "offline";
			groups = JSON.parse(localStorage.getItem('mk_groups') || '["General"]');
            groupSortDirections = JSON.parse(localStorage.getItem('mk_sorts') || '{}');
            collapsedGroups = JSON.parse(localStorage.getItem('mk_collapsed') || '{}');
			bookmarks = JSON.parse(localStorage.getItem('mk_bookmarks') || '[]').sort((a: any, b: any) => a.position - b.position);
        }
	}

	async function syncData() {
		localStorage.setItem('mk_groups', JSON.stringify(groups));
		localStorage.setItem('mk_bookmarks', JSON.stringify(bookmarks));
        localStorage.setItem('mk_sorts', JSON.stringify(groupSortDirections));
        localStorage.setItem('mk_collapsed', JSON.stringify(collapsedGroups));
        localStorage.setItem('mk_accent', accentColor);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks, groups, sorts: groupSortDirections, collapsed: collapsedGroups, appTitle })
            });
            syncStatus = res.ok ? "synced" : "offline";
        } catch (e) { syncStatus = "offline"; }
	}

    function handleJSONImport(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const d = JSON.parse(ev.target?.result as string);
                if(d.bookmarks) bookmarks = d.bookmarks;
                if(d.groups) groups = d.groups;
                if(d.sorts) groupSortDirections = d.sorts;
                if(d.collapsed) collapsedGroups = d.collapsed;
                syncData();
            } catch (err) { alert("Invalid JSON file"); }
        };
        reader.readAsText(file);
    }

    function handleCSVImport(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const rows = text.split('\n').slice(1);
            const newBks: Bookmark[] = rows.filter(r => r.trim()).map(row => {
                const [title, url, group, tags, notes] = row.split(',').map(s => s.trim());
                return {
                    id: crypto.randomUUID(), title: title || url,
                    url: url.startsWith('http') ? url : `https://${url}`,
                    group: group || "General", position: bookmarks.length,
                    tags: tags ? tags.split(';') : [], notes: notes || ""
                };
            });
            bookmarks = [...bookmarks, ...newBks];
            groups = [...new Set([...groups, ...newBks.map(b => b.group)])];
            syncData();
        };
        reader.readAsText(file);
    }

	// --- 4. CORE LOGIC ---
    function toggleCollapse(groupName: string) {
        collapsedGroups[groupName] = !collapsedGroups[groupName];
        syncData(); // Persist the collapse state
    }

    function toggleSort(groupName: string) {
        const current = groupSortDirections[groupName] || 'none';
        groupSortDirections[groupName] = current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none';
        syncData();
    }

    function handleDrop(targetGroup: string, targetIndex: number) {
		if (!draggedId) return;
        groupSortDirections[targetGroup] = 'none';
		const movedItem = bookmarks.find(b => b.id === draggedId);
		if (!movedItem) return;

		let othersInGroup = bookmarks.filter(b => b.group === targetGroup && b.id !== draggedId).sort((a,b) => a.position - b.position);
        othersInGroup.splice(targetIndex, 0, { ...movedItem, group: targetGroup });
        
        const rest = bookmarks.filter(b => b.group !== targetGroup && b.id !== draggedId);
        bookmarks = [...rest, ...othersInGroup].map((b, i) => ({...b, position: i}));
		draggedId = null; syncData();
	}

    function addBookmarkToGroup(group: string) {
        const url = columnInputs[group];
        if (!url) return;
        bookmarks = [...bookmarks, { 
            id: crypto.randomUUID(), title: url.split('/')[2] || url, 
            url: url.startsWith('http') ? url : `https://${url}`, 
            group, position: bookmarks.length, tags: [], notes: "", icon: "" 
        }];
        columnInputs[group] = "";
        syncData();
    }

	// --- 5. DERIVED ---
	let allUniqueTags = $derived(Array.from(new Set(bookmarks.flatMap(b => b.tags || []))).sort());
	let filteredBookmarks = $derived(bookmarks.filter(b => {
		const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.notes?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTag = !selectedTag || b.tags?.includes(selectedTag);
		return matchesSearch && matchesTag;
	}));

    function getGroupBookmarks(groupName: string) {
        let items = filteredBookmarks.filter(b => b.group === groupName);
        const dir = groupSortDirections[groupName] || 'none';
        if (dir === 'asc') return items.sort((a, b) => a.title.localeCompare(b.title));
        if (dir === 'desc') return items.sort((a, b) => b.title.localeCompare(a.title));
        return items.sort((a, b) => a.position - b.position);
    }

    function openEditModal(bookmark: Bookmark) {
		activeBookmark = bookmark;
		tempTitle = bookmark.title; tempUrl = bookmark.url;
		tempTags = bookmark.tags?.join(", ") || "";
        tempNotes = bookmark.notes || "";
		tempIcon = bookmark.icon || "";
		isEditModalOpen = true;
        contextMenu.show = false;
	}

	function savePopupChanges() {
		if (activeBookmark) {
			const tagArray = tempTags.split(",").map(t => t.trim()).filter(t => t !== "");
			bookmarks = bookmarks.map(b => b.id === activeBookmark!.id ? { 
                ...b, title: tempTitle, url: tempUrl, tags: tagArray, notes: tempNotes, icon: tempIcon 
            } : b);
			syncData(); isEditModalOpen = false;
		}
	}
</script>

<div class="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors font-light" style="--brand: {themeMap[accentColor]}">
	
	<header class="h-14 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex items-center px-4 justify-between shrink-0 z-20 shadow-sm">
		<div class="flex items-center gap-4 flex-1">
			<div class="flex items-center gap-2 font-normal uppercase tracking-tighter text-sm" style="color: var(--brand)">
				<BookmarkIcon size={20} fill="currentColor" fill-opacity="0.2" /> <span class="font-bold">{appTitle}</span>
			</div>
            
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all
                {syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 
                 syncStatus === 'loading' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20' : 
                 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:border-red-500/20'}">
                <Database size={10} />
                <span>{syncStatus}</span>
            </div>

            <button onclick={() => isEditMode = !isEditMode} class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all {isEditMode ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}">
                {#if isEditMode}<Unlock size={14}/> Unlock{:else}<Lock size={14}/> Lock{/if}
            </button>
		</div>

		<div class="flex items-center gap-2 flex-[2] justify-center">
            <div class="relative w-[500px] flex items-center gap-2">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-3 text-slate-400" size={16} />
                    <input bind:value={searchQuery} placeholder="Search bookmarks..." class="w-full pl-12 pr-4 py-3 text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <button onclick={() => showTags = !showTags} class="p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                    {#if showTags}<EyeOff size={18}/>{:else}<Filter size={18}/>{/if}
                </button>
                <button onclick={() => compactMode = !compactMode} class="p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                    {#if compactMode}<LayoutList size={18}/>{:else}<List size={18}/>{/if}
                </button>
            </div>
        </div>

		<div class="flex items-center gap-6 flex-1 justify-end">
            <div class="text-xl font-mono font-medium text-slate-700 dark:text-slate-200 tabular-nums tracking-tight uppercase">
                {time.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <button onclick={() => isDarkMode = !isDarkMode} class="p-2 text-slate-400 hover:text-slate-600 transition-transform active:scale-90">
                {#if isDarkMode}<Sun size={20}/>{:else}<Moon size={20}/>{/if}
            </button>
            <button onclick={() => isSettingsOpen = true} class="p-2 text-slate-400 hover:text-slate-600"><Settings size={20}/></button>
		</div>
	</header>

	{#if showTags}
		<div class="px-4 py-2.5 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
			<button onclick={() => selectedTag = null} class="px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold {selectedTag === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}">All Items</button>
			{#each allUniqueTags as tag}
				<button onclick={() => selectedTag = (selectedTag === tag ? null : tag)} class="px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold {selectedTag === tag ? 'text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}" style={selectedTag === tag ? `background-color: var(--brand)` : ''}>#{tag}</button>
			{/each}
		</div>
	{/if}

	<main class="flex-1 p-6 overflow-y-auto grid gap-8 items-start content-start" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
		{#each groups as group}
			<section class="flex flex-col min-h-[40px]" ondragover={(e) => e.preventDefault()} ondrop={() => handleDrop(group, getGroupBookmarks(group).length)}>
				<div class="flex items-center justify-between mb-3 px-1">
                    <div class="flex items-center gap-3">
                        {#if editingGroupId === group}
                            <input bind:value={groupRenameValue} class="bg-transparent border-b border-blue-500 outline-none text-xs font-bold uppercase" autofocus onblur={() => { groups = groups.map(g => g === group ? groupRenameValue : g); bookmarks = bookmarks.map(b => b.group === group ? {...b, group: groupRenameValue} : b); editingGroupId = null; syncData(); }} />
                        {:else}
                            <button onclick={() => toggleCollapse(group)} class="flex items-center gap-2 group/title">
                                <ChevronRight size={12} class="text-slate-400 transition-transform duration-200 {collapsedGroups[group] ? '' : 'rotate-90'}" />
                                <h2 class="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover/title:text-slate-600 transition-colors">{group}</h2>
                            </button>
                            
                            <button onclick={() => toggleSort(group)} class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
                                {#if groupSortDirections[group] === 'asc'} <SortAsc size={14} class="text-blue-500" />
                                {:else if groupSortDirections[group] === 'desc'} <SortDesc size={14} class="text-blue-500" />
                                {:else} <SortAsc size={14} class="text-slate-300" /> {/if}
                            </button>
                            {#if isEditMode}
                                <button onclick={() => {editingGroupId = group; groupRenameValue = group;}} class="text-slate-400 hover:text-blue-500"><Edit2 size={12}/></button>
                            {/if}
                        {/if}
                    </div>
				</div>

				<div class="bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden divide-y dark:divide-slate-800 transition-all duration-300 {collapsedGroups[group] ? 'max-h-0 opacity-0 invisible' : 'max-h-[2000px] opacity-100 visible'}">
                    {#if isEditMode}
						<div class="p-3 bg-slate-50 dark:bg-slate-800/50 flex gap-2">
							<input bind:value={columnInputs[group]} placeholder="Quick add URL..." class="flex-1 text-sm p-3 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none" onkeydown={(e) => e.key === 'Enter' && addBookmarkToGroup(group)} />
							<button onclick={() => addBookmarkToGroup(group)} class="text-white px-4 rounded-xl" style="background-color: var(--brand)"><Plus size={18}/></button>
						</div>
					{/if}

                    {#each getGroupBookmarks(group) as b, i (b.id)}
						<div 
							class="bookmark-row group flex items-center gap-2.5 {compactMode ? 'py-1.5 px-3' : 'p-3.5'} hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" 
							draggable={isEditMode} ondragstart={() => (draggedId = b.id)} ondrop={(e) => { e.stopPropagation(); handleDrop(group, i); }}
							onclick={() => isEditMode ? openEditModal(b) : window.open(b.url.startsWith('http') ? b.url : `https://${b.url}`)}
							oncontextmenu={(e) => { e.preventDefault(); contextMenu = { x: e.clientX, y: e.clientY, show: true, target: b }; }}
						>
							<GripVertical size={14} class="text-slate-300 {isEditMode ? 'opacity-100' : 'opacity-0'} shrink-0" />
                            <div class="w-4 h-4 flex items-center justify-center shrink-0">
                                {#if b.icon && isSVG(b.icon)}
                                    <div class="w-full h-full flex items-center justify-center text-slate-400">{@html b.icon}</div>
                                {:else}
                                    <img src={b.icon || `https://www.google.com/s2/favicons?domain=${b.url}`} alt="" class="w-full h-full object-contain grayscale-[0.3] group-hover:grayscale-0 transition-all" />
                                {/if}
                            </div>
							<div class="flex-1 truncate">
                                <div class="text-[13px] font-medium truncate text-slate-700 dark:text-slate-200 leading-tight">{b.title}</div>
                                {#if !compactMode && (b.tags?.length || b.notes)}
                                    <div class="flex gap-2 items-center mt-1">
                                        {#each b.tags || [] as t} <span class="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">#{t}</span> {/each}
                                        {#if b.notes} <span class="text-[10px] italic text-slate-400 truncate font-light">{b.notes}</span> {/if}
                                    </div>
                                {/if}
                            </div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</main>

	{#if isSettingsOpen}
		<div class="fixed inset-0 z-[100] flex justify-end">
			<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => isSettingsOpen = false}></div>
			<div class="relative w-80 bg-white dark:bg-slate-900 h-full p-8 shadow-2xl border-l dark:border-slate-800 overflow-y-auto space-y-8">
				<div class="flex justify-between items-center border-b dark:border-slate-800 pb-4">
					<h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">System Settings</h3>
					<button onclick={() => isSettingsOpen = false}><X/></button>
				</div>
                <div class="space-y-4">
                    <label class="text-[10px] font-bold uppercase text-slate-400 block">Accent Color</label>
                    <div class="flex gap-3">
                        {#each Object.keys(themeMap) as color}
                            <button onclick={() => { accentColor = color; syncData(); }} class="w-7 h-7 rounded-full ring-2 ring-offset-2 dark:ring-offset-slate-900 {accentColor === color ? 'ring-slate-400' : 'ring-transparent'}" style="background-color: {themeMap[color]}"></button>
                        {/each}
                    </div>
                </div>

                <div class="space-y-4 pt-4 border-t dark:border-slate-800">
                    <label class="text-[10px] font-bold uppercase text-slate-400 block">Manage Groups</label>
                    <div class="flex gap-2">
                        <input bind:value={newGroupName} placeholder="New Group Name..." class="flex-1 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl text-xs outline-none" onkeydown={(e) => {if(e.key === 'Enter' && newGroupName) { groups = [...groups, newGroupName]; newGroupName = ""; syncData(); }}} />
                        <button onclick={() => { if(newGroupName) { groups = [...groups, newGroupName]; newGroupName = ""; syncData(); }}} class="p-3 bg-blue-500 text-white rounded-xl"><Plus size={16}/></button>
                    </div>
                    <div class="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                        {#each groups as g}
                            <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl group/g">
                                <span class="text-xs font-medium">{g}</span>
                                <button onclick={() => { if(confirm(`Delete "${g}"?`)) { groups = groups.filter(gr => gr !== g); bookmarks = bookmarks.filter(b => b.group !== g); syncData(); }}} class="text-slate-300 hover:text-red-500 opacity-0 group-hover/g:opacity-100"><Trash2 size={14}/></button>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="pt-4 border-t dark:border-slate-800 space-y-2">
                    <button onclick={() => {
                        const blob = new Blob([JSON.stringify({ groups, bookmarks, sorts: groupSortDirections, collapsed: collapsedGroups, appTitle }, null, 2)], { type: 'application/json' });
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; a.click();
                    }} class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors">
                        <span>Export Backup (JSON)</span> <Download size={16}/>
                    </button>
                    <label class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors">
                        <span>Import JSON</span> <Upload size={16}/>
                        <input type="file" accept=".json" class="hidden" onchange={handleJSONImport}/>
                    </label>
                    <label class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors">
                        <span>Import CSV</span> <FileSpreadsheet size={16}/>
                        <input type="file" accept=".csv" class="hidden" onchange={handleCSVImport}/>
                    </label>
                </div>
			</div>
		</div>
	{/if}

    {#if contextMenu.show}
		<div class="fixed z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border dark:border-slate-800 py-1.5 w-48 text-[11px]" style="top: {contextMenu.y}px; left: {contextMenu.x}px;" onclick={(e) => e.stopPropagation()}>
			<button onclick={() => openEditModal(contextMenu.target!)} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 font-medium transition-colors"><Edit2 size={14} class="text-blue-500"/> Edit Properties</button>
			<button onclick={() => { navigator.clipboard.writeText(contextMenu.target!.url); contextMenu.show = false; }} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 font-medium transition-colors"><Copy size={14} class="text-emerald-500"/> Copy Link</button>
            <button onclick={() => { const b = contextMenu.target!; bookmarks = [...bookmarks, {...b, id: crypto.randomUUID(), title: b.title + " (Copy)"}]; syncData(); contextMenu.show = false; }} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 font-medium transition-colors"><CopyPlus size={14} class="text-purple-500"/> Duplicate</button>
            <div class="h-px bg-slate-100 dark:bg-slate-800 my-1.5 mx-2"></div>
			<button onclick={() => { bookmarks = bookmarks.filter(b => b.id !== contextMenu.target!.id); syncData(); contextMenu.show = false; }} class="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-500 flex items-center gap-3 font-medium transition-colors"><Trash2 size={14}/> Delete</button>
		</div>
	{/if}

    {#if isEditModalOpen}
		<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
			<div class="bg-white dark:bg-slate-900 w-full max-sm rounded-[2.5rem] p-10 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
                <div class="flex justify-between border-b dark:border-slate-800 pb-4">
				    <h3 class="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Properties</h3>
                    <button onclick={() => isEditModalOpen = false} class="text-slate-400 hover:text-slate-800 transition-colors"><X size={20}/></button>
                </div>
				<input bind:value={tempTitle} placeholder="Title" class="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-sm outline-none font-medium transition-all focus:ring-2 focus:ring-blue-500/20" />
				<input bind:value={tempUrl} placeholder="URL" class="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-sm outline-none font-medium transition-all focus:ring-2 focus:ring-blue-500/20" />
                <input bind:value={tempTags} placeholder="Tags (comma separated)" class="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-sm outline-none font-medium transition-all focus:ring-2 focus:ring-blue-500/20" />
                <textarea bind:value={tempNotes} placeholder="Notes..." class="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-sm h-24 outline-none resize-none font-medium transition-all focus:ring-2 focus:ring-blue-500/20"></textarea>
                <textarea bind:value={tempIcon} placeholder="SVG string or Icon URL" class="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-[10px] font-mono h-20 outline-none resize-none transition-all focus:ring-2 focus:ring-blue-500/20"></textarea>
				<button onclick={savePopupChanges} class="w-full py-4 rounded-2xl font-black text-white uppercase tracking-[0.2em] shadow-xl transition-all hover:opacity-90 active:scale-95" style="background-color: var(--brand)">Update</button>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) { margin: 0; padding: 0; overflow: hidden; font-family: 'Century Gothic', sans-serif; }
    .bookmark-row { border-left: 3px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    .bookmark-row:hover { border-left: 3px solid var(--brand); }
    ::-webkit-scrollbar { display: none; }
</style>
