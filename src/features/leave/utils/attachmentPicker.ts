import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';

import {
    LEAVE_ATTACHMENT_EXTENSIONS,
    LEAVE_ATTACHMENT_MAX_BYTES,
    LEAVE_ATTACHMENT_MAX_COUNT,
} from '../validation/leaveSchemas';
import type { LeaveAttachmentInput } from '../types';

/**
 * The document-picker seam for leave attachments.
 *
 * ## Why this module exists
 *
 * The Request Leave screen previously asked the user to *type a filename* into a
 * text field and fabricated a `file://<name>` URI from it. That was not a choice of
 * style — no file-picker module was installed, so there was no way to reach a real
 * device file. The result was a control that could never upload anything: the URI
 * pointed at a path that did not exist, so even the multipart branch in
 * [`leaveApi.create`](src/features/leave/api/leaveApi.ts:79) would have sent a file
 * the platform had no bytes for.
 *
 * This module turns a real picker into the same [`LeaveAttachmentInput`](src/features/leave/types/index.ts:88)
 * shape the API layer already consumes, so nothing downstream had to change.
 *
 * ## Why the limits are enforced here and not only in the schema
 *
 * The backend validates `attachments.*` (type, `max:5120`), but a picker hands back
 * whatever the user chose. Validating before the upload means a rejected request
 * costs the user nothing: they see "only pdf, jpg… are accepted" against the file
 * they picked, instead of waiting for a round-trip and then reading a 422 against an
 * opaque `attachments.0` field.
 *
 * ## Cancellation is not an error
 *
 * `pick()` rejects when the user backs out of the system picker. That is a normal
 * outcome and must not surface as a failure, so it is converted to `null`.
 */

/** The picker is already open — a second tap while the sheet animates would throw. */
export const PICKER_IN_PROGRESS_MESSAGE = 'The file picker is already open.';

/** The platform could not open the chosen file type. */
export const PICKER_UNSUPPORTED_TYPE_MESSAGE =
    'That file type cannot be opened. Choose a pdf, image or Word document.';

export type PickAttachmentResult =
    /** The user cancelled — not an error, show nothing. */
    | { status: 'cancelled' }
    /** At least one usable file was chosen. */
    | { status: 'picked'; files: LeaveAttachmentInput[] }
    /** The selection was rejected; `message` is already user-facing. */
    | { status: 'rejected'; message: string };

/**
 * Categories offered to the platform picker.
 *
 * `types.images` plus the Word types are the broadest way to express "pdf, jpg,
 * jpeg, png, doc, docx" — the MIME list the backend accepts. The exact extension is
 * re-checked below, because Android providers are documented to ignore the type
 * filter (hence `hasRequestedType` on the result).
 */
const PICKER_TYPE_FILTER = [types.pdf, types.images, types.doc, types.docx];

/** `certificate.PDF` → `pdf`. `noextension` → `''`. */
function extensionOf(name: string): string {
    const segments = name.split('.');

    if (segments.length < 2) {
        return '';
    }

    return (segments.pop() ?? '').toLowerCase();
}

/** Human-readable size for the rejection message. */
function describeLimit(): string {
    return `${LEAVE_ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB`;
}

/**
 * Validates one picked document against the spec's attachment rules.
 *
 * Returns a user-facing message, or `null` when the file is acceptable.
 * Exported so the rules are testable without a native picker.
 */
export function validatePickedAttachment(file: {
    name: string | null;
    size: number | null;
    type: string | null;
}): string | null {
    const name = file.name ?? '';
    const extension = extensionOf(name);

    // The backend keys off the extension in `mimes:pdf,jpg,jpeg,png,doc,docx`.
    if (!(LEAVE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)) {
        return `Only ${LEAVE_ATTACHMENT_EXTENSIONS.join(', ')} files are accepted.`;
    }

    // A null size means the provider withheld metadata. Rejecting would block a
    // legitimate file, and the backend still enforces `max:5120`, so it is allowed
    // through and left to the server to judge.
    if (file.size !== null && file.size > LEAVE_ATTACHMENT_MAX_BYTES) {
        return `Each file must be ${describeLimit()} or smaller.`;
    }

    return null;
}

/**
 * MIME type to send as the multipart part's content type.
 *
 * The picker supplies one, but it can be `null` or a generic
 * `application/octet-stream` from some Android providers. Laravel's `mimes` rule
 * validates by extension, but a correct part type keeps the upload self-describing,
 * so an unknown type is filled in from the extension.
 */
function mimeTypeFor(name: string, provided: string | null): string {
    if (provided !== null && provided.length > 0 && provided !== 'application/octet-stream') {
        return provided;
    }

    switch (extensionOf(name)) {
        case 'pdf':
            return 'application/pdf';
        case 'doc':
            return 'application/msword';
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        default:
            return 'application/octet-stream';
    }
}

/**
 * Opens the platform document picker and maps the selection onto the API's input type.
 *
 * @param remaining how many more files the request can accept. Used to cap
 *   multi-selection and to reject an over-limit selection with a clear message.
 * @param existingNames names already attached, so re-picking the same file twice
 *   updates nothing and does not consume a second slot.
 */
export async function pickLeaveAttachments(
    remaining: number,
    existingNames: readonly string[] = [],
): Promise<PickAttachmentResult> {
    if (remaining <= 0) {
        return {
            status: 'rejected',
            message: `You can attach up to ${LEAVE_ATTACHMENT_MAX_COUNT} files.`,
        };
    }

    let results;

    try {
        results = await pick({
            type: PICKER_TYPE_FILTER,
            // Multi-select only when more than one slot is free; otherwise the
            // platform lets the user pick a batch the form would have to reject.
            allowMultiSelection: remaining > 1,
            mode: 'import',
        });
    } catch (error) {
        if (isErrorWithCode(error)) {
            if (error.code === errorCodes.OPERATION_CANCELED) {
                return { status: 'cancelled' };
            }

            if (error.code === errorCodes.IN_PROGRESS) {
                return { status: 'rejected', message: PICKER_IN_PROGRESS_MESSAGE };
            }

            if (error.code === errorCodes.UNABLE_TO_OPEN_FILE_TYPE) {
                return { status: 'rejected', message: PICKER_UNSUPPORTED_TYPE_MESSAGE };
            }
        }

        // Anything else is unexpected; the screen shows it verbatim, so it must be
        // phrased for a user rather than surfaced as a raw native message.
        return {
            status: 'rejected',
            message: 'The file could not be attached. Please try again.',
        };
    }

    if (results.length > remaining) {
        // The cap itself is not the useful fact here — the user needs to know how
        // many slots are left on *this* request, which may be fewer than the limit
        // because files are already attached.
        return {
            status: 'rejected',
            message:
                remaining === 1
                    ? 'Only 1 more file can be attached.'
                    : `Only ${remaining} more files can be attached.`,
        };
    }

    const files: LeaveAttachmentInput[] = [];
    const seen = new Set(existingNames.map(name => name.toLowerCase()));

    for (const result of results) {
        // A null name means the provider gave us nothing usable to upload.
        if (result.name === null) {
            return {
                status: 'rejected',
                message: 'That file could not be read. Choose it again.',
            };
        }

        // The provider can hand back a document it failed to read the bytes from.
        if (result.error !== null) {
            return {
                status: 'rejected',
                message: 'That file could not be read. Choose it again.',
            };
        }

        const invalid = validatePickedAttachment(result);

        if (invalid !== null) {
            return { status: 'rejected', message: invalid };
        }

        // Re-picking an attached file is a no-op rather than a duplicate row.
        if (seen.has(result.name.toLowerCase())) {
            continue;
        }

        seen.add(result.name.toLowerCase());
        files.push({
            uri: result.uri,
            name: result.name,
            mimeType: mimeTypeFor(result.name, result.type),
            ...(result.size !== null ? { size: result.size } : {}),
        });
    }

    if (files.length === 0) {
        return { status: 'cancelled' };
    }

    return { status: 'picked', files };
}
