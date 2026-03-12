import { ScanResult } from "@/lib/domain";

export class EntryError extends Error {
  code: ScanResult;
  status: number;

  constructor(code: ScanResult, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
