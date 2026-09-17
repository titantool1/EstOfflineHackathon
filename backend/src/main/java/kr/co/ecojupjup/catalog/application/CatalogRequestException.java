package kr.co.ecojupjup.catalog.application;

public final class CatalogRequestException extends RuntimeException {
    public final boolean notFound;
    public CatalogRequestException(boolean notFound) {
        super(notFound ? "CATALOG_ACTION_NOT_FOUND" : "INVALID_CATALOG_QUERY");
        this.notFound = notFound;
    }
}
