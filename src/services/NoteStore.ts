import { randomUUID } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createChildLogger } from "./logger.js";
import type { SRENote, NoteQuery } from "../types/index.js";

const logger = createChildLogger("NoteStore");

const DATA_DIR = path.join(process.cwd(), "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");

export class NoteStore {
  private static instance: NoteStore;
  private notes: Map<string, SRENote> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): NoteStore {
    if (!NoteStore.instance) {
      NoteStore.instance = new NoteStore();
    }
    return NoteStore.instance;
  }

  /**
   * Initialize the note store
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(DATA_DIR)) {
        await mkdir(DATA_DIR, { recursive: true });
      }

      if (existsSync(NOTES_FILE)) {
        const data = await readFile(NOTES_FILE, "utf-8");
        const parsed = JSON.parse(data) as SRENote[];
        for (const note of parsed) {
          this.notes.set(note.id, note);
        }
        logger.info({ count: this.notes.size }, "Notes loaded from disk");
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, "Failed to initialize note store");
      this.initialized = true; // Continue with empty store
    }
  }

  /**
   * Save notes to disk
   */
  private async persist(): Promise<void> {
    try {
      const data = JSON.stringify(Array.from(this.notes.values()), null, 2);
      await writeFile(NOTES_FILE, data, "utf-8");
    } catch (error) {
      logger.error({ error }, "Failed to persist notes");
    }
  }

  /**
   * Create a new note
   */
  async create(note: Omit<SRENote, "id" | "createdAt" | "updatedAt">): Promise<SRENote> {
    await this.init();
    
    const now = new Date().toISOString();
    const newNote: SRENote = {
      ...note,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.notes.set(newNote.id, newNote);
    await this.persist();
    
    logger.debug({ noteId: newNote.id }, "Note created");
    return newNote;
  }

  /**
   * Update an existing note
   */
  async update(id: string, updates: Partial<Omit<SRENote, "id" | "createdAt">>): Promise<SRENote | null> {
    await this.init();
    
    const existing = this.notes.get(id);
    if (!existing) return null;

    const updated: SRENote = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.notes.set(id, updated);
    await this.persist();
    
    logger.debug({ noteId: id }, "Note updated");
    return updated;
  }

  /**
   * Get a note by ID
   */
  async get(id: string): Promise<SRENote | null> {
    await this.init();
    return this.notes.get(id) || null;
  }

  /**
   * Query notes with filters
   */
  async query(query: NoteQuery): Promise<SRENote[]> {
    await this.init();
    
    let results = Array.from(this.notes.values());

    if (query.repoFullName) {
      results = results.filter(n => n.repoFullName === query.repoFullName);
    }

    if (query.workflowId !== undefined) {
      results = results.filter(n => n.workflowId === query.workflowId);
    }

    if (query.runId !== undefined) {
      results = results.filter(n => n.runId === query.runId);
    }

    if (query.resolved !== undefined) {
      results = results.filter(n => n.resolved === query.resolved);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(n => 
        query.tags!.some(tag => n.tags.includes(tag))
      );
    }

    // Sort by updatedAt descending
    results.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Delete a note
   */
  async delete(id: string): Promise<boolean> {
    await this.init();
    
    const deleted = this.notes.delete(id);
    if (deleted) {
      await this.persist();
      logger.debug({ noteId: id }, "Note deleted");
    }
    return deleted;
  }

  /**
   * Mark a note as resolved
   */
  async resolve(id: string): Promise<SRENote | null> {
    return this.update(id, { resolved: true });
  }

  /**
   * Get summary of notes for a repository
   */
  async getRepoSummary(repoFullName: string): Promise<string> {
    const notes = await this.query({ repoFullName, limit: 10 });
    
    if (notes.length === 0) {
      return `No SRE notes for ${repoFullName}.`;
    }

    const unresolvedCount = notes.filter(n => !n.resolved).length;
    const lines = [
      `## SRE Notes for ${repoFullName}`,
      `Total: ${notes.length} | Unresolved: ${unresolvedCount}`,
      "",
    ];

    for (const note of notes.slice(0, 5)) {
      const status = note.resolved ? "✅" : "🔴";
      lines.push(`${status} **${note.title}** (${note.updatedAt})`);
      lines.push(`   ${note.content.slice(0, 100)}${note.content.length > 100 ? "..." : ""}`);
    }

    return lines.join("\n");
  }
}
