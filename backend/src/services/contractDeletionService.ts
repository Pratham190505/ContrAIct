import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../config/db";
import { logger } from "../config/logger";

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
export const DELETE_SUCCESS_MESSAGE = "Contract and all associated analysis have been permanently deleted.";

type DeleteContractInput = {
  contractId: string;
  userId: string;
};

type CleanupInput = {
  contractId: string;
  userId: string;
  uploadedPath: string;
  reportPaths: string[];
  documentHash: string | null;
};

export async function deleteContractEverywhere({ contractId, userId }: DeleteContractInput) {
  const startedAt = Date.now();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, userId },
    include: { reports: true },
  });

  if (!contract) {
    return null;
  }

  const reportPaths = contract.reports.map((report) => report.filePath);
  const uploadedPath = contract.filePath;
  const documentHash = contract.fileHash;

  const deletedRecords = await prisma.$transaction(async (tx) => {
    const chatMessages = await tx.chatMessage.deleteMany({ where: { contractId } });
    const clauses = await tx.clause.deleteMany({ where: { contractId } });
    const obligations = await tx.obligation.deleteMany({ where: { contractId } });
    const dates = await tx.contractDate.deleteMany({ where: { contractId } });
    const reports = await tx.report.deleteMany({ where: { contractId } });
    await tx.contract.delete({ where: { id: contractId } });

    return {
      chatMessages: chatMessages.count,
      clauses: clauses.count,
      obligations: obligations.count,
      dates: dates.count,
      reports: reports.count,
      contracts: 1,
    };
  });

  const cleanup = await cleanupContractResources({
    contractId,
    userId,
    uploadedPath,
    reportPaths,
    documentHash,
  });

  logger.info("[CONTRACT DELETE]", {
    contractId,
    userId,
    deletedRecords,
    deletedPdf: cleanup.uploadedPdf.deleted,
    deletedReports: cleanup.reports.deleted,
    deletedCache: cleanup.aiService.cacheDeleted,
    deletedEmbeddings: cleanup.aiService.embeddingsDeleted,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    deleted: true,
    message: DELETE_SUCCESS_MESSAGE,
    deletedRecords,
  };
}

async function cleanupContractResources(input: CleanupInput) {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  const reportCandidates = [
    ...input.reportPaths,
    path.resolve(process.cwd(), "reports", `${input.contractId}-report.pdf`),
  ];

  const fsTasks = [
    removePathBestEffort(input.uploadedPath, "uploadedPdf", input.contractId, input.userId),
    ...uniqueStrings(reportCandidates).map((reportPath) =>
      removePathBestEffort(reportPath, "generatedReport", input.contractId, input.userId),
    ),
    removePathBestEffort(path.join(uploadDir, input.contractId), "uploadFolder", input.contractId, input.userId),
    removePathBestEffort(path.join(uploadDir, "tmp", input.contractId), "tmpUploadFolder", input.contractId, input.userId),
    removePathBestEffort(path.join(uploadDir, "ocr", input.contractId), "ocrTempFolder", input.contractId, input.userId),
    removePathBestEffort(path.join(uploadDir, "previews", input.contractId), "previews", input.contractId, input.userId),
    removePathBestEffort(path.join(uploadDir, "thumbnails", input.contractId), "thumbnails", input.contractId, input.userId),
  ];

  const [uploadedPdf, ...otherFileResults] = await Promise.all(fsTasks);
  const aiCleanup = await cleanupAIResources(input.contractId, input.documentHash, input.userId);

  return {
    uploadedPdf: { deleted: uploadedPdf.deleted },
    reports: {
      deleted: otherFileResults.filter((result) => result.label === "generatedReport" && result.deleted).length,
    },
    aiService: aiCleanup,
  };
}

async function removePathBestEffort(filePath: string | null | undefined, label: string, contractId: string, userId: string) {
  if (!filePath) return { label, deleted: false, missing: true };

  const target = path.resolve(filePath);
  try {
    await fs.access(target);
    await fs.rm(target, { recursive: true, force: true });
    return { label, deleted: true, path: target };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { label, deleted: false, missing: true, path: target };
    }
    logger.warn("[CONTRACT DELETE FILE WARNING]", {
      contractId,
      userId,
      label,
      path: target,
      error: error instanceof Error ? error.message : error,
    });
    return { label, deleted: false, path: target, error };
  }
}

async function cleanupAIResources(contractId: string, documentHash: string | null, userId: string) {
  try {
    const response = await axios.post(
      `${AI_SERVICE}/cleanup`,
      { contractId, documentHash },
      {
        timeout: 15000,
        headers: { "x-ai-secret": process.env.AI_SERVICE_SECRET ?? "" },
      },
    );
    const resources = Array.isArray(response.data?.resources) ? response.data.resources : [];
    return {
      cacheDeleted: resources.filter((item: any) => item.label === "cache" && item.deleted).length,
      embeddingsDeleted: resources.some((item: any) => item.label === "vectorstore" && item.deleted),
    };
  } catch (error) {
    logger.warn("[CONTRACT DELETE AI CLEANUP WARNING]", {
      contractId,
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return { cacheDeleted: 0, embeddingsDeleted: false };
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
