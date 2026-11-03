package com.harness.mobile.core.api

import kotlinx.serialization.Serializable

@Serializable
data class ArtifactRef(
    val artifactId: String,
    val fileId: String,
    val fileName: String,
    val mediaType: String = "text/plain",
    val fileKind: String = "text",
    val size: Int = 0,
    val status: String = "ready",
    val createdAt: String = "",
    val seriesId: String? = null,
    val logicalName: String? = null,
    val versionNumber: Int? = null,
    val isCurrent: Boolean? = null,
)

@Serializable
data class ArtifactVersionContext(
    val seriesId: String,
    val baseArtifactId: String,
    val expectedCurrentArtifactId: String,
    val changeSummary: String? = null,
)

@Serializable
data class RestoreArtifactRequest(
    val expectedCurrentArtifactId: String,
    val idempotencyKey: String,
)

@Serializable
data class RestoreArtifactResult(
    val artifact: ArtifactRef,
    val file: FileRef,
    val series: ArtifactSeriesRef,
)

@Serializable
data class ArtifactSeriesRef(
    val seriesId: String,
    val sessionId: String,
    val logicalName: String,
    val currentArtifactId: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
    val versions: List<ArtifactRef> = emptyList(),
)
