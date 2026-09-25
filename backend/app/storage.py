from aiobotocore.session import get_session
from botocore.exceptions import ClientError

from app.settings import Settings


def create_s3_client(settings: Settings):
    return get_session().create_client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


async def ensure_bucket(s3, name: str) -> None:
    try:
        await s3.head_bucket(Bucket=name)
    except ClientError:
        await s3.create_bucket(Bucket=name)
