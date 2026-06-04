export namespace gitman {
	
	export class BranchInfo {
	    name: string;
	    is_remote: boolean;
	    is_current: boolean;
	    sha: string;
	
	    static createFrom(source: any = {}) {
	        return new BranchInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.is_remote = source["is_remote"];
	        this.is_current = source["is_current"];
	        this.sha = source["sha"];
	    }
	}
	export class CommitDetail {
	    sha: string;
	    message: string;
	    date: string;
	    author: string;
	    parents: string[];
	    is_head: boolean;
	    refs: string[];
	
	    static createFrom(source: any = {}) {
	        return new CommitDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sha = source["sha"];
	        this.message = source["message"];
	        this.date = source["date"];
	        this.author = source["author"];
	        this.parents = source["parents"];
	        this.is_head = source["is_head"];
	        this.refs = source["refs"];
	    }
	}
	export class GraphLine {
	    graph: string;
	    hash: string;
	    parents: string;
	    message: string;
	    author: string;
	    date: string;
	    refs: string;
	    is_commit: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GraphLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.graph = source["graph"];
	        this.hash = source["hash"];
	        this.parents = source["parents"];
	        this.message = source["message"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.refs = source["refs"];
	        this.is_commit = source["is_commit"];
	    }
	}
	export class SegData {
	    from_lane: number;
	    to_lane: number;
	    row: number;
	    type: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new SegData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from_lane = source["from_lane"];
	        this.to_lane = source["to_lane"];
	        this.row = source["row"];
	        this.type = source["type"];
	        this.color = source["color"];
	    }
	}
	export class NodeData {
	    row: number;
	    lane: number;
	    sha: string;
	    message: string;
	    author: string;
	    date: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.row = source["row"];
	        this.lane = source["lane"];
	        this.sha = source["sha"];
	        this.message = source["message"];
	        this.author = source["author"];
	        this.date = source["date"];
	        this.color = source["color"];
	    }
	}
	export class GraphOutput {
	    max_lane: number;
	    rows: number;
	    nodes: NodeData[];
	    segments: SegData[];
	
	    static createFrom(source: any = {}) {
	        return new GraphOutput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.max_lane = source["max_lane"];
	        this.rows = source["rows"];
	        this.nodes = this.convertValues(source["nodes"], NodeData);
	        this.segments = this.convertValues(source["segments"], SegData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace updater {
	
	export class CommitInfo {
	    sha: string;
	    message: string;
	    date: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sha = source["sha"];
	        this.message = source["message"];
	        this.date = source["date"];
	    }
	}
	export class Config {
	    // Go type: struct { RemoteURL string; ProjectDir string }
	    Git: any;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Git = this.convertValues(source["Git"], Object);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateStatus {
	    has_update: boolean;
	    remote_commit: CommitInfo;
	    local_commit?: CommitInfo;
	
	    static createFrom(source: any = {}) {
	        return new UpdateStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.has_update = source["has_update"];
	        this.remote_commit = this.convertValues(source["remote_commit"], CommitInfo);
	        this.local_commit = this.convertValues(source["local_commit"], CommitInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

