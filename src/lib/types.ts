/** Shape of GET /api/library: the whole catalog, loaded once by the app. */
export interface Room {
  id: number;
  name: string;
  sort: number;
}
export interface Bookcase {
  id: number;
  roomId: number;
  name: string;
  sort: number;
}
export type ShelfKind = "books" | "toys" | "notes" | "albums" | "other";
export interface Shelf {
  id: number;
  bookcaseId: number;
  name: string;
  sort: number;
  heightUnits: number;
  kind: ShelfKind;
  frontOfShelfId: number | null;
}
export interface Theme {
  id: number;
  nameEs: string;
  nameEn: string;
}
export type BookStatus = "shelf" | "reading" | "lent" | "missing";
export interface Book {
  id: number;
  title: string;
  author: string | null;
  language: string;
  themeId: number | null;
  series: string | null;
  seriesNumber: number | null;
  notes: string | null;
  homeShelfId: number;
  position: number;
  status: BookStatus;
  holder: string | null;
  statusRoomId: number | null;
  statusSince: string | null;
}
export interface LibraryData {
  rooms: Room[];
  bookcases: Bookcase[];
  shelves: Shelf[];
  themes: Theme[];
  books: Book[];
  /** Names used before (borrowers and family), most recent first. */
  people: string[];
  /** Optional features switched on by environment variables. */
  features: { photo: boolean };
}
