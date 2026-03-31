function generateCollectionContent(
  position: number,
  canvasIds: string[],
  sourceId: string,
  existingCanvasIds: string[] = [],
) {
  return canvasIds
    .map((id) =>
      existingCanvasIds.includes(id)
        ? null
        : {
            canvasId: id,
            position: ++position,
            sourceId,
          },
    )
    .filter((elt) => elt !== null);
}

export { generateCollectionContent };
