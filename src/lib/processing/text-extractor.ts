import mammoth from "mammoth";
import pdf from "pdf-parse";
import { Readable } from "stream";

/**
 * Text extraction utilities for different file types
 */

export interface TextExtractionResult {
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    pages?: number;
    words?: number;
  };
}

export class TextExtractor {
  /**
   * Extract text from DOCX buffer
   */
  async extractFromDocx(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });

      // Basic word count
      const words = result.value.trim().split(/\s+/).length;

      return {
        text: result.value,
        metadata: {
          words,
        },
      };
    } catch (error) {
      console.error("Error extracting text from DOCX:", error);
      throw new Error(
        `Failed to extract text from DOCX: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extract text from PDF buffer
   */
  async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const data = await pdf(buffer);

      return {
        text: data.text,
        metadata: {
          title: data.info?.Title,
          author: data.info?.Author,
          pages: data.numpages,
          words: data.text.trim().split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      throw new Error(
        `Failed to extract text from PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extract text from buffer based on MIME type
   */
  async extractFromBuffer(
    buffer: Buffer,
    mimeType: string
  ): Promise<TextExtractionResult> {
    switch (mimeType) {
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return this.extractFromDocx(buffer);

      case "application/pdf":
        return this.extractFromPdf(buffer);

      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Extract text from a stream
   */
  async extractFromStream(
    stream: Readable,
    mimeType: string
  ): Promise<TextExtractionResult> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const result = await this.extractFromBuffer(buffer, mimeType);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      stream.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if a MIME type is supported for text extraction
   */
  isSupportedMimeType(mimeType: string): boolean {
    const supportedTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
      "application/pdf", // PDF
    ];

    return supportedTypes.includes(mimeType);
  }

  /**
   * Get the appropriate extraction method name for a MIME type
   */
  getExtractionMethod(mimeType: string): string {
    switch (mimeType) {
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX extraction";
      case "application/pdf":
        return "PDF extraction";
      default:
        return "Unknown extraction";
    }
  }
}

// Singleton instance
let extractorInstance: TextExtractor | null = null;

export function getTextExtractor(): TextExtractor {
  if (!extractorInstance) {
    extractorInstance = new TextExtractor();
  }
  return extractorInstance;
}
