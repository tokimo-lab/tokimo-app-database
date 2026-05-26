use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, Set};
use uuid::Uuid;

use crate::db::entities::db_connections;
use crate::handlers::AppError;

/// Input for creating or updating a database connection record.
#[derive(Debug)]
pub struct DbConnectionInput {
    pub driver: String,
    pub name: String,
    pub host: String,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub params: Option<String>,
}

pub struct DbConnectionRepo;

impl DbConnectionRepo {
    pub async fn list_all(db: &DatabaseConnection) -> Result<Vec<db_connections::Model>, AppError> {
        let rows = db_connections::Entity::find().all(db).await?;
        Ok(rows)
    }

    pub async fn get_by_id(db: &DatabaseConnection, id: Uuid) -> Result<db_connections::Model, AppError> {
        db_connections::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound("DB connection not found".into()))
    }

    pub async fn create(db: &DatabaseConnection, input: DbConnectionInput) -> Result<db_connections::Model, AppError> {
        let now = chrono::Utc::now().fixed_offset();
        let model = db_connections::ActiveModel {
            id: Set(Uuid::new_v4()),
            driver: Set(input.driver),
            name: Set(input.name),
            host: Set(input.host),
            port: Set(input.port),
            username: Set(input.username),
            password: Set(input.password),
            database: Set(input.database),
            params: Set(input.params),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let result = model.insert(db).await?;
        Ok(result)
    }

    pub async fn update(
        db: &DatabaseConnection,
        id: Uuid,
        input: DbConnectionInput,
    ) -> Result<db_connections::Model, AppError> {
        let existing = db_connections::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound("DB connection not found".into()))?;

        let now = chrono::Utc::now().fixed_offset();
        let mut am: db_connections::ActiveModel = existing.into();
        am.driver = Set(input.driver);
        am.name = Set(input.name);
        am.host = Set(input.host);
        am.port = Set(input.port);
        am.username = Set(input.username);
        am.password = Set(input.password);
        am.database = Set(input.database);
        am.params = Set(input.params);
        am.updated_at = Set(now);
        let result = am.update(db).await?;
        Ok(result)
    }

    pub async fn delete(db: &DatabaseConnection, id: Uuid) -> Result<(), AppError> {
        db_connections::Entity::delete_by_id(id).exec(db).await?;
        Ok(())
    }
}
