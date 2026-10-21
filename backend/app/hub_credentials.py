"""Password rules for an individual home's local administrator."""

import re
import unicodedata

from pydantic import BaseModel, Field, model_validator


def first_name(name):
    name = name.strip().split()[0] if name.strip() else "admin"
    return "".join(c for c in unicodedata.normalize("NFKC", name) if c.isalnum() or c in "_-")[:64] or "admin"


class HubCredentials(BaseModel):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[\w-]+$")
    password: str = Field(min_length=12, max_length=128, repr=False)
    password_repeat: str = Field(min_length=12, max_length=128, repr=False)

    @model_validator(mode="after")
    def valid(self):
        if self.password != self.password_repeat:
            raise ValueError("passwords_do_not_match")
        if not re.search(r"[A-Za-zÆØÅæøå]", self.password) or not re.search(r"[0-9]", self.password):
            raise ValueError("password_requires_letters_and_numbers")
        return self
