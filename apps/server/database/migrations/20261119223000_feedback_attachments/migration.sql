CREATE TABLE "feedback_attachments" (
    "feedbackId" UUID NOT NULL,
    "contentType" VARCHAR(24) NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "feedback_attachments_pkey" PRIMARY KEY ("feedbackId"),
    CONSTRAINT "feedback_attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "feedback_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedback_attachments_type_and_size" CHECK (
        octet_length("data") >= 12 AND (
            ("contentType" IN ('image/png', 'image/jpeg', 'image/webp') AND octet_length("data") <= 2097152)
            OR ("contentType" IN ('video/mp4', 'video/webm', 'video/quicktime') AND octet_length("data") <= 5242880)
        )
    )
);
