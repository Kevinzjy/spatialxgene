#!/usr/bin/env Rscript
# Extract Seurat spatial object to temp files for Python to build h5ad.
# Usage: Rscript seurat2h5ad.R <input.rds|input.rds.gz> <output_dir>
# Writes: matrix.mtx, barcodes.tsv, genes.tsv, obs.csv, spatial.csv (if spatial coords exist)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript seurat2h5ad.R <input.rds|input.rds.gz> <output_dir>")
}
input_rds <- args[1]
output_dir <- args[2]

if (!file.exists(input_rds)) {
  stop("Input file not found: ", input_rds)
}
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

# Load Seurat and Matrix
suppressPackageStartupMessages({
  library(Seurat)
  library(Matrix)
})

# Read RDS (supports .rds and .rds.gz)
if (grepl("\\.gz$", input_rds)) {
  obj <- readRDS(gzcon(file(input_rds, "rb")))
} else {
  obj <- readRDS(input_rds)
}

if (!inherits(obj, "Seurat")) {
  stop("RDS does not contain a Seurat object. Got: ", class(obj)[1])
}

assay <- DefaultAssay(obj)
# SeuratObject 5+: use layer= (slot= is defunct)
counts <- tryCatch(
  GetAssayData(obj, layer = "counts"),
  error = function(e) NULL
)
if (is.null(counts) || length(counts) == 0 || all(dim(counts) == 0)) {
  counts <- tryCatch(
    GetAssayData(obj, layer = "data"),
    error = function(e) NULL
  )
}
if (length(counts) == 0 || all(dim(counts) == 0)) {
  stop("No counts or data in default assay")
}

# Matrix market: genes x cells (rows x cols); AnnData expects cells x genes, we transpose in Python
Matrix::writeMM(counts, file.path(output_dir, "matrix.mtx"))
writeLines(colnames(counts), file.path(output_dir, "barcodes.tsv"))
writeLines(rownames(counts), file.path(output_dir, "genes.tsv"))

# Metadata -> obs
meta <- obj@meta.data
meta$barcode <- rownames(meta)
write.csv(meta, file.path(output_dir, "obs.csv"), row.names = FALSE)

# Spatial coordinates: try GetTissueCoordinates (Visium etc.), then meta.data columns
spatial_df <- NULL
tryCatch({
  coords <- GetTissueCoordinates(obj)
  if (!is.null(coords) && nrow(coords) > 0) {
    # Visium: imagecol, imagerow (or x, y)
    if ("imagecol" %in% colnames(coords) && "imagerow" %in% colnames(coords)) {
      spatial_df <- data.frame(
        barcode = rownames(coords),
        x = as.numeric(coords$imagecol),
        y = as.numeric(coords$imagerow)
      )
    } else if ("x" %in% colnames(coords) && "y" %in% colnames(coords)) {
      spatial_df <- data.frame(
        barcode = rownames(coords),
        x = as.numeric(coords$x),
        y = as.numeric(coords$y)
      )
    }
  }
}, error = function(e) NULL)

if (is.null(spatial_df) && nrow(meta) > 0) {
  # Fallback: look in meta.data
  if ("x" %in% colnames(meta) && "y" %in% colnames(meta)) {
    spatial_df <- data.frame(barcode = meta$barcode, x = as.numeric(meta$x), y = as.numeric(meta$y))
  } else if ("imagecol" %in% colnames(meta) && "imagerow" %in% colnames(meta)) {
    spatial_df <- data.frame(barcode = meta$barcode, x = as.numeric(meta$imagecol), y = as.numeric(meta$imagerow))
  } else if ("x_centroid" %in% colnames(meta) && "y_centroid" %in% colnames(meta)) {
    spatial_df <- data.frame(barcode = meta$barcode, x = as.numeric(meta$x_centroid), y = as.numeric(meta$y_centroid))
  }
}

if (!is.null(spatial_df) && nrow(spatial_df) > 0) {
  write.csv(spatial_df, file.path(output_dir, "spatial.csv"), row.names = FALSE)
}

# Tissue images: extract from Seurat and write as raw RGB (Visium-style for viewer)
# Writes output_dir/images/<key>.bin (height, width as int32, then H*W*3 uint8) and image_info.csv
img_names <- tryCatch(
  if (length(obj@images) > 0) names(obj@images) else character(0),
  error = function(e) character(0)
)
if (length(img_names) == 0) {
  img_names <- tryCatch(SeuratObject::Images(obj), error = function(e) character(0))
}
if (length(img_names) > 0) {
  dir.create(file.path(output_dir, "images"), recursive = TRUE, showWarnings = FALSE)
  img_info <- list()
  for (nm in img_names) {
    tryCatch({
      img_obj <- tryCatch(obj@images[[nm]], error = function(e) NULL)
      if (is.null(img_obj)) img_obj <- tryCatch(obj[[nm]], error = function(e) NULL)
      if (is.null(img_obj)) next
      arr <- tryCatch(
        SeuratObject::GetImage(img_obj, mode = "raw"),
        error = function(e) tryCatch(GetImage(img_obj, mode = "raw"), error = function(e2) NULL)
      )
      if (is.null(arr) || length(dim(arr)) < 2) next
      if (length(dim(arr)) == 2) {
        arr <- array(c(arr, arr, arr), dim = c(dim(arr), 3))
      }
      if (dim(arr)[3] == 4) arr <- arr[, , 1:3, drop = FALSE]
      if (dim(arr)[3] != 3) next
      h <- dim(arr)[1]
      w <- dim(arr)[2]
      if (max(arr, na.rm = TRUE) <= 1) arr <- arr * 255
      arr[is.na(arr)] <- 0
      arr <- array(as.raw(pmin(255, pmax(0, c(arr)))), dim = dim(arr))
      bin_path <- file.path(output_dir, "images", paste0(nm, ".bin"))
      con <- file(bin_path, "wb")
      on.exit(close(con), add = TRUE)
      writeBin(as.integer(c(h, w)), con, size = 4)
      # writeBin with array can be unreliable; write as raw vector (column-major = R order)
      writeBin(as.vector(arr), con)
      scale_f <- NA
      sf <- tryCatch(
        img_obj@scale.factors,
        error = function(e) tryCatch(img_obj[["scale.factors"]], error = function(e2) NULL)
      )
      if (!is.null(sf)) {
        if (is.list(sf)) scale_f <- sf[[1]]
        else if (length(sf) > 0) scale_f <- sf[1]
      }
      img_info[[length(img_info) + 1]] <- data.frame(key = nm, height = h, width = w, scale_factor = scale_f)
    }, error = function(e) NULL)
  }
  if (length(img_info) > 0) {
    img_info_df <- do.call(rbind, img_info)
    write.csv(img_info_df, file.path(output_dir, "images", "image_info.csv"), row.names = FALSE)
  }
}

# Signal success
writeLines("ok", file.path(output_dir, "status.txt"))
