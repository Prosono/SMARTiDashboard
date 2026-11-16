"""Read the hub's Home Assistant Marketplace integration catalog."""

import re

from fastapi import APIRouter, Depends, HTTPException

from .ha import HAError


def marketplace_router(management, admin):
    router = APIRouter(prefix="/api/manage/marketplace", dependencies=[Depends(admin)])

    @router.get("")
    async def integrations():
        if management.demo:
            raise HTTPException(404, "marketplace_unavailable")
        management.connected()
        try:
            repositories = await management.ha.request(
                "marketplace/repositories/list", categories=["integration"]
            )
        except HAError as error:
            if error.code in {"unknown_command", "not_loaded"}:
                raise HTTPException(404, "marketplace_unavailable") from None
            raise HTTPException(502, "marketplace_catalog_failed") from None
        except TimeoutError:
            raise HTTPException(503, "marketplace_catalog_failed") from None
        if not isinstance(repositories, list):
            raise HTTPException(502, "marketplace_catalog_failed")

        catalog = []
        for repository in repositories:
            if (
                not isinstance(repository, dict)
                or repository.get("category") != "integration"
                or repository.get("hide")
            ):
                continue
            full_name = repository.get("full_name")
            if not isinstance(full_name, str) or not re.fullmatch(
                r"[A-Za-z0-9-]+/(?!\.{1,2}$)[A-Za-z0-9_.-]+", full_name
            ):
                continue
            catalog.append(
                {
                    **{
                        key: repository.get(key)
                        for key in (
                            "description",
                            "domain",
                            "authors",
                            "topics",
                            "installed",
                            "installed_version",
                            "stars",
                        )
                    },
                    "full_name": full_name,
                    "name": repository.get("name") or full_name,
                }
            )
        return catalog

    return router
