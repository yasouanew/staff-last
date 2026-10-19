/**
 * Jest stand-in for `@react-native-documents/picker`.
 *
 * The package is a TurboModule: importing it under Jest reaches for a native module
 * that does not exist, and only the code paths that actually *call* `pick()` would
 * fail — which is worse, because the failure lands inside a screen test rather than
 * at import time.
 *
 * The package ships its own mock, but it is resolved through the package's `jest`
 * subpath, which a `moduleNameMapper`/`setupFilesAfterEnv` registration cannot rely
 * on being present after a version bump. Declaring it here keeps the stub beside the
 * other mocks in this directory and makes the surface the app actually uses explicit.
 *
 * `pick` rejects by default. That mirrors a user who opens the picker and backs out,
 * which is the outcome almost every unrelated test should see — a screen must not
 * appear to have attached a file it never chose. Tests that need a selection
 * override `pick` with `mockResolvedValueOnce`.
 */

const errorCodes = {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
    NULL_PRESENTER: 'NULL_PRESENTER',
};

class OperationCanceledError extends Error {
    constructor() {
        super('User canceled document picker');
        this.name = 'OperationCanceledError';
        this.code = errorCodes.OPERATION_CANCELED;
    }
}

const isErrorWithCode = error => Boolean(error) && typeof error.code === 'string';

const types = {
    allFiles: '*/*',
    audio: 'audio/*',
    csv: ['text/csv', 'text/comma-separated-values'],
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    images: 'image/*',
    pdf: 'application/pdf',
    plainText: 'text/plain',
    json: 'application/json',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    video: 'video/*',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
};

const pick = jest.fn(() => Promise.reject(new OperationCanceledError()));

const keepLocalCopy = jest.fn(() => Promise.reject(new OperationCanceledError()));
const pickDirectory = jest.fn(() => Promise.reject(new OperationCanceledError()));
const saveDocuments = jest.fn(() => Promise.resolve([]));
const releaseLongTermAccess = jest.fn(() => Promise.resolve());
const releaseSecureAccess = jest.fn(() => Promise.resolve());
const isKnownType = jest.fn(() => Promise.resolve({ kind: 'unknown' }));

module.exports = {
    __esModule: true,
    pick,
    types,
    errorCodes,
    isErrorWithCode,
    keepLocalCopy,
    pickDirectory,
    saveDocuments,
    releaseLongTermAccess,
    releaseSecureAccess,
    isKnownType,
    OperationCanceledError,
};
