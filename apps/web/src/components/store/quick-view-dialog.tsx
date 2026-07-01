"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductImage } from "@/components/store/product-image";
import { fetchProduct, type ProductCardDto } from "@/lib/search-client";

/**
 * Product quick-view modal (Spec 007). Opens when `productId` is set, fetches
 * the product from GET /api/products/[id], and shows loading / error / detail
 * states. Keeps the experience one-page — no routing.
 */
export function QuickViewDialog({
  productId,
  onClose,
}: {
  productId: string | null;
  onClose: () => void;
}) {
  const [product, setProduct] = useState<ProductCardDto | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle",
  );

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setStatus("loading");
    setProduct(null);
    fetchProduct(productId, controller.signal)
      .then((p) => {
        setProduct(p);
        setStatus("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("quick-view load failed", err);
        setStatus("error");
      });
    return () => controller.abort();
  }, [productId]);

  return (
    <Dialog open={productId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[92vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {status === "ready" && product ? product.title : "Product"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {status === "loading" && (
            <div className="flex gap-5">
              <Skeleton className="h-48 w-48 shrink-0 rounded-lg" />
              <div className="flex flex-col gap-3 grow">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          )}

          {status === "error" && (
            <p className="text-sm text-destructive py-8 text-center">
              Couldn&apos;t load this product. Please try again.
            </p>
          )}

          {status === "ready" && product && (
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="flex items-center justify-center bg-accent/50 rounded-lg h-56 w-full sm:w-56 shrink-0 overflow-hidden">
                <ProductImage
                  src={product.image}
                  alt={product.title}
                  width={product.imageWidth}
                  height={product.imageHeight}
                  className="h-56 w-full object-contain"
                />
              </div>

              <div className="flex flex-col gap-3 grow min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  {product.rating !== undefined && (
                    <Badge
                      size="sm"
                      variant="warning"
                      shape="circle"
                      className="rounded-full gap-1"
                    >
                      <Star
                        className="text-white -mt-0.5"
                        style={{ fill: "currentColor" }}
                      />{" "}
                      {product.rating.toFixed(1)}
                    </Badge>
                  )}
                  <Badge
                    size="sm"
                    variant={product.inStock ? "success" : "secondary"}
                  >
                    {product.inStock ? "In stock" : "Out of stock"}
                  </Badge>
                </div>

                {product.price !== undefined && (
                  <span className="text-xl font-semibold text-mono">
                    ${product.price.toFixed(2)}
                  </span>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-foreground">
                  {product.brand && (
                    <span>
                      Brand:{" "}
                      <span className="font-medium text-foreground">
                        {product.brand}
                      </span>
                    </span>
                  )}
                  {product.category && (
                    <span>
                      Category:{" "}
                      <span className="font-medium text-foreground">
                        {product.category}
                      </span>
                    </span>
                  )}
                  {product.reviews !== undefined && (
                    <span>{product.reviews} reviews</span>
                  )}
                </div>

                {product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.slice(0, 8).map((tag) => (
                      <Badge key={tag} size="sm" variant="secondary" appearance="light">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {product.description && (
                  <p className="text-sm text-secondary-foreground leading-6">
                    {product.description}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
